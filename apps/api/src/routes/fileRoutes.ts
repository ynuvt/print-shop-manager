import express from "express";
import {
  authMiddleware,
  ExtendedRequest,
} from "../middleware/authMiddleware.js";
import { prisma } from "@printowl/db";
import { fileSchema } from "@printowl/types";
import {
  ColorMode,
  duplex,
  orientation as orientationEnum,
  scaleMode as scaleModeEnum,
} from "../../../../packages/db/dist/generated/prisma/client.js";
import { optionsSchema } from "@printowl/types/dist/validators/fileValidator.js";
import { PrintJobStatus } from "../../../../packages/db/dist/generated/prisma/enums.js";

const app = express.Router();

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
      await prisma.file.delete({
        where: { id: id },
      });
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
        },
      });
      if (!job) {
        return res.status(404).json({ error: "Job not found." });
      }
      if (job.status !== PrintJobStatus.DRAFT) {
        return res.status(403).json({ error: "This job is not available for review." });
      }
      const isMember =
        job.userId === req.user.uid || job.owners.some((o) => o.userId === req.user.uid);
      if (!isMember) {
        return res.status(403).json({ error: "You do not have access to this job." });
      }
      const file = await prisma.file.create({
        data: {
          printJob: {
            connect: {
              id: jobId,
            },
          },
          name: fileData.name,
          pages: fileData.pages,
          url: fileData.url,
          uploadedByUserId: req.user.uid,
          uploadedByRole: job.userId === req.user.uid ? "OWNER" : "COLLABORATOR",
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
              duplex:
                fileData.option.duplex === "ONE" ? duplex.ONE : duplex.BOTH,
              paperSize: fileData.option.paperSize,
            },
          },
        },
      });
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
          })
        : 0;

      await prisma.file.update({
        where: { id: fileId },
        data: { fileCost },
      });

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
