import express from "express";
import {
  authMiddleware,
  ExtendedRequest,
} from "../middleware/authMiddleware.js";
import { prisma } from "@printowl/db";
import { fileSchema } from "@printowl/types";
import socket from "../config/socket.js";
import {
  ColorMode,
  duplex,
  orientation as orientationEnum,
  scaleMode as scaleModeEnum,
} from "../../../../packages/db/dist/generated/prisma/client.js";
import { optionsSchema } from "@printowl/types/dist/validators/fileValidator.js";
import { PrintJobStatus } from "../../../../packages/db/dist/generated/prisma/enums.js";
import { deleteObjectFromR2ByUrl } from "../utils/r2Storage.js";

const app = express.Router();

async function recomputeJobTotals(tx: Pick<typeof prisma, 'printJob' | 'file'>, printJobId: string) {
  const job = await tx.printJob.findUnique({
    where: { id: printJobId },
    select: { id: true, files: { select: { pages: true, fileCost: true } } },
  });
  if (!job) return;
  const totalPages = job.files.reduce((sum, f) => sum + (f.pages ?? 0), 0);
  const totalCost = job.files.reduce((sum, f) => sum + (f.fileCost ?? 0), 0);
  const { calculateEstimatedTime } = await import("@printowl/shared-utils");
  await tx.printJob.update({
    where: { id: printJobId },
    data: { totalPages, totalCost, estimatedTime: calculateEstimatedTime(totalPages) },
  });
  socket.emit("job-file-added", printJobId);
}

async function resolveLinkedWhatsAppPhone(userId: string): Promise<string | null> {
  const linked = await prisma.whatsAppUser.findFirst({
    where: { userId },
    select: { phoneNumber: true },
  });
  return linked?.phoneNumber ?? null;
}

function isFileOwnedByViewer(args: {
  viewerUserId: string;
  viewerPhoneNumber: string | null;
  file: { uploadedByUserId: string | null; uploadedByPhoneNumber: string | null };
}) {
  if (args.file.uploadedByUserId && args.file.uploadedByUserId === args.viewerUserId) {
    return true;
  }
  if (
    args.viewerPhoneNumber &&
    args.file.uploadedByPhoneNumber &&
    args.file.uploadedByPhoneNumber === args.viewerPhoneNumber
  ) {
    return true;
  }
  return false;
}

async function assertCanMutateFile(args: {
  fileId: string;
  viewerUserId: string;
}): Promise<
  | { ok: true; printJobId: string }
  | { ok: false; status: number; error: string }
> {
  const linkedPhone = await resolveLinkedWhatsAppPhone(args.viewerUserId);
  const record = await prisma.file.findUnique({
    where: { id: args.fileId },
    select: {
      id: true,
      printJobId: true,
      uploadedByUserId: true,
      uploadedByPhoneNumber: true,
      printJob: {
        select: {
          userId: true,
          status: true,
          owners: { select: { userId: true } },
        },
      },
    },
  });

  if (!record || !record.printJob) {
    return { ok: false, status: 404, error: "File not found." };
  }

  if (record.printJob.status !== PrintJobStatus.DRAFT) {
    return { ok: false, status: 403, error: "This file can no longer be modified." };
  }

  const isJobOwner =
    record.printJob.userId === args.viewerUserId ||
    record.printJob.owners.some((o) => o.userId === args.viewerUserId);

  if (isJobOwner) {
    return { ok: true, printJobId: record.printJobId };
  }

  if (
    isFileOwnedByViewer({
      viewerUserId: args.viewerUserId,
      viewerPhoneNumber: linkedPhone,
      file: {
        uploadedByUserId: record.uploadedByUserId,
        uploadedByPhoneNumber: record.uploadedByPhoneNumber,
      },
    })
  ) {
    return { ok: true, printJobId: record.printJobId };
  }

  return { ok: false, status: 403, error: "You can only modify your own files." };
}

app.delete(
  "/",
  authMiddleware(["customer", "admin"]),
  async (req: ExtendedRequest, res) => {
    const { id } = req.body;
    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "File ID is required." });
    }
    if (!req.user?.uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const access = await assertCanMutateFile({
        fileId: id,
        viewerUserId: req.user.uid,
      });
      if (!access.ok) {
        return res.status(access.status).json({ error: access.error });
      }
      // Grab the R2 object URLs before deleting the row so we can clean up
      // storage (the PDF and its preview) and avoid orphaning objects.
      const fileToDelete = await prisma.file.findUnique({
        where: { id },
        select: { url: true, previewUrl: true },
      });
      await prisma.$transaction(async (tx) => {
        await tx.file.delete({ where: { id } });
        await recomputeJobTotals(tx, access.printJobId);
      });
      // Best-effort R2 cleanup — never block the response on storage deletion.
      if (fileToDelete?.url) {
        deleteObjectFromR2ByUrl(fileToDelete.url).catch((err) =>
          console.error("[file-delete] R2 cleanup (url) failed:", err),
        );
      }
      if (fileToDelete?.previewUrl) {
        deleteObjectFromR2ByUrl(fileToDelete.previewUrl).catch((err) =>
          console.error("[file-delete] R2 cleanup (preview) failed:", err),
        );
      }
      socket.emit("job-file-added", access.printJobId);
      res.status(200).json({ message: "File removed successfully." });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove file." });
    }
  },
);

app.post(
  "/:jobId",
  authMiddleware(["customer"]),
  async (req: ExtendedRequest, res) => {
    const { jobId } = req.params;
    if (!jobId || typeof jobId !== "string") {
      return res.status(400).json({ error: "Job ID is required." });
    }
    if (!req.user?.uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const schema = fileSchema.safeParse(req.body);
    if (!schema.success) {
      return res.status(400).json({ error: schema.error.flatten() });
    }
    const fileData = schema.data;
    try {
      const job = await prisma.printJob.findUnique({
        where: { id: jobId },
        select: {
          id: true,
          status: true,
          userId: true,
          owners: { select: { userId: true } },
          _count: { select: { files: true } },
        },
      });
      if (!job) {
        return res.status(404).json({ error: "Job not found." });
      }
      if (job.status !== PrintJobStatus.DRAFT) {
        return res.status(403).json({ error: "This job is not available for review." });
      }
      if (job._count.files >= 30) {
        return res.status(400).json({ error: "You cannot add more than 30 files." });
      }
      const isMember =
        job.userId === req.user!.uid || job.owners.some((o) => o.userId === req.user!.uid);
      if (!isMember) {
        return res.status(403).json({ error: "You do not have access to this job." });
      }
      const linkedPhone = await resolveLinkedWhatsAppPhone(req.user.uid);
      const user = await prisma.user.findUnique({
        where: { id: req.user.uid },
        select: { name: true },
      });
      const { calculateFileCost } = await import("@printowl/shared-utils");
      const fileCost = calculateFileCost(fileData.pages, {
        paperSize: "A4",
        colorMode: fileData.option.colorMode,
        orientation: fileData.option.orientation,
        scaleMode: fileData.option.scaleMode,
        pageRange: fileData.option.pageRange,
        customRange: fileData.option.customRange,
        duplex: fileData.option.duplex,
        copies: fileData.option.copies,
        pagesPerSheet: fileData.option.pagesPerSheet || 1,
      });

      const file = await prisma.$transaction(async (tx) => {
        const created = await tx.file.create({
          data: {
            printJobId: jobId,
            name: fileData.name,
            pages: fileData.pages,
            url: fileData.url,
            fileCost,
            uploadedByUserId: req.user!.uid,
            uploadedByPhoneNumber: linkedPhone,
            uploadedByDisplayName: user?.name ?? null,
            uploadedByRole: job.userId === req.user!.uid ? "OWNER" : "COLLABORATOR",
            option: {
              create: {
                copies: fileData.option.copies,
                colorMode:
                  fileData.option.colorMode == "COLOR"
                    ? ColorMode.COLOR
                    : ColorMode.BW,
                orientation:
                  fileData.option.orientation === "LANDSCAPE"
                    ? orientationEnum.LANDSCAPE
                    : orientationEnum.PORTRAIT,
                scaleMode:
                  fileData.option.scaleMode === "NOSCALE"
                    ? scaleModeEnum.NOSCALE
                    : fileData.option.scaleMode === "SHRINK"
                      ? scaleModeEnum.SHRINK
                      : scaleModeEnum.FIT,
                duplex: fileData.option.duplex === "ONE" ? duplex.ONE : duplex.BOTH,
                paperSize: fileData.option.paperSize,
                pageRange: fileData.option.pageRange,
                customRange: fileData.option.customRange,
                pagesPerSheet: fileData.option.pagesPerSheet || 1,
              },
            },
          },
          include: { option: true },
        });
        await recomputeJobTotals(tx, jobId);
        return created;
      });
      socket.emit("job-file-added", jobId);
      // Previews are rendered on demand client-side from the PDF (pdf.js).
      res.status(201).json({ message: "File added successfully.", file });
    } catch (error) {
      console.log(error);
      res.status(500).json({ error: "Failed to add file." });
    }
  },
);
app.put(
  "/printOptions/:fileId",
  authMiddleware(["customer"]),
  async (req: ExtendedRequest, res) => {
    const { fileId } = req.params;

    if (!fileId || typeof fileId !== "string") {
      return res.status(400).json({ error: "File ID is required." });
    }
    if (!req.user?.uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const schema = optionsSchema.safeParse(req.body);

    if (!schema.success) {
      return res.status(400).json({ error: schema.error.flatten() });
    }

    const optionsData = schema.data;

    try {
      const access = await assertCanMutateFile({
        fileId,
        viewerUserId: req.user.uid,
      });
      if (!access.ok) {
        return res.status(access.status).json({ error: access.error });
      }
      const file = await prisma.file.findUnique({
        where: { id: fileId },
        select: {
          printJobId: true,
          pages: true,
          option: {
            select: {
              id: true,
            },
          },
        },
      });

      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      if (!file.option?.id) {
        return res.status(404).json({ error: "Print options not found." });
      }

      const updatedOption = await prisma.printOption.update({
        where: {
          id: file.option.id,
        },
        data: {
          copies: optionsData.copies,
          colorMode:
            optionsData.colorMode === "COLOR" ? ColorMode.COLOR : ColorMode.BW,
          orientation:
            optionsData.orientation === "LANDSCAPE"
              ? orientationEnum.LANDSCAPE
              : orientationEnum.PORTRAIT,
          scaleMode:
            optionsData.scaleMode === "NOSCALE"
              ? scaleModeEnum.NOSCALE
              : optionsData.scaleMode === "SHRINK"
                ? scaleModeEnum.SHRINK
                : scaleModeEnum.FIT,
          duplex: optionsData.duplex === "ONE" ? duplex.ONE : duplex.BOTH,
          paperSize: optionsData.paperSize,
          pageRange: optionsData.pageRange,
          customRange: optionsData.customRange,
          pagesPerSheet: optionsData.pagesPerSheet || 1,
        },
      });

      const fileCost = file.pages
        ? (await import("@printowl/shared-utils")).calculateFileCost(file.pages, {
            paperSize: "A4",
            colorMode: optionsData.colorMode,
            orientation: optionsData.orientation,
            scaleMode: optionsData.scaleMode,
            pageRange: optionsData.pageRange,
            customRange: optionsData.customRange,
            duplex: optionsData.duplex,
            copies: optionsData.copies,
            pagesPerSheet: optionsData.pagesPerSheet || 1,
          })
        : 0;

      await prisma.file.update({
        where: { id: fileId },
        data: { fileCost },
      });

      await prisma.$transaction(async (tx) => {
        await recomputeJobTotals(tx, access.printJobId);
      });
      socket.emit("job-file-added", access.printJobId);

      res.status(200).json({
        message: "Print options updated successfully.",
        option: updatedOption,
      });
    } catch (error) {
      console.log(error);
      res.status(500).json({ error: "Failed to update print options." });
    }
  },
);
export default app;
