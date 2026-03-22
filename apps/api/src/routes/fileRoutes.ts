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
} from "../../../../packages/db/dist/generated/prisma/client.js";
import { optionsSchema } from "@printowl/types/dist/validators/fileValidator.js";

const app = express.Router();

async function getJobColorMode(jobId: string): Promise<"BW" | "COLOR" | null> {
  const jobFiles = await prisma.file.findMany({
    where: { printJobId: jobId },
    select: {
      option: {
        select: {
          colorMode: true,
        },
      },
    },
  });

  if (!jobFiles.length) return null;

  const firstMode = jobFiles[0]!.option.colorMode;
  const allSame = jobFiles.every((file) => file.option.colorMode === firstMode);

  if (!allSame) {
    throw new Error("INCONSISTENT_JOB_COLOR_MODE");
  }

  return firstMode === ColorMode.COLOR ? "COLOR" : "BW";
}

app.delete(
  "/",
  authMiddleware(["user", "admin"]),
  async (req: ExtendedRequest, res) => {
    const { id } = req.body;
    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "File ID is required." });
    }
    try {
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
  authMiddleware(["user"]),
  async (req: ExtendedRequest, res) => {
    const { jobId } = req.params;
    if (!jobId || typeof jobId !== "string") {
      return res.status(400).json({ error: "Job ID is required." });
    }
    const schema = fileSchema.safeParse(req.body);
    if (!schema.success) {
      return res.status(400).json({ error: schema.error.flatten() });
    }
    const fileData = schema.data;
    try {
      const existingJobColorMode = await getJobColorMode(jobId);

      if (
        existingJobColorMode &&
        existingJobColorMode !== fileData.option.colorMode
      ) {
        return res.status(400).json({
          error:
            "All files in a job must use the same color mode. Add files using the job's existing color mode.",
        });
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
          option: {
            create: {
              copies: fileData.option.copies,
              colorMode:
                fileData.option.colorMode == "COLOR"
                  ? ColorMode.COLOR
                  : ColorMode.BW,
              duplex:
                fileData.option.duplex === "ONE" ? duplex.ONE : duplex.BOTH,
              paperSize: fileData.option.paperSize,
            },
          },
        },
      });
      res.status(201).json({ message: "File added successfully.", file });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "INCONSISTENT_JOB_COLOR_MODE"
      ) {
        return res.status(409).json({
          error:
            "This job already has inconsistent color modes. Normalize existing file options before adding new files.",
        });
      }
      console.log(error);
      res.status(500).json({ error: "Failed to add file." });
    }
  },
);
app.put(
  "/printOptions/:fileId",
  authMiddleware(["user"]),
  async (req: ExtendedRequest, res) => {
    const { fileId } = req.params;

    if (!fileId || typeof fileId !== "string") {
      return res.status(400).json({ error: "File ID is required." });
    }

    const schema = optionsSchema.safeParse(req.body);

    if (!schema.success) {
      return res.status(400).json({ error: schema.error.flatten() });
    }

    const optionsData = schema.data;

    try {
      const file = await prisma.file.findUnique({
        where: { id: fileId },
        select: { optionId: true, printJobId: true },
      });

      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      const existingJobColorMode = await getJobColorMode(file.printJobId);

      if (
        existingJobColorMode &&
        existingJobColorMode !== optionsData.colorMode
      ) {
        return res.status(400).json({
          error:
            "Color mode is job-level. All files in a job must use the same color mode.",
        });
      }

      const updatedOption = await prisma.printOption.update({
        where: {
          id: file.optionId,
        },
        data: {
          copies: optionsData.copies,
          colorMode:
            optionsData.colorMode === "COLOR"
              ? ColorMode.COLOR
              : ColorMode.BW,
          duplex: optionsData.duplex === "ONE" ? duplex.ONE : duplex.BOTH,
          paperSize: optionsData.paperSize,
          pageRange: optionsData.pageRange,
          customRange: optionsData.customRange,
        },
      });

      res.status(200).json({
        message: "Print options updated successfully.",
        option: updatedOption,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "INCONSISTENT_JOB_COLOR_MODE"
      ) {
        return res.status(409).json({
          error:
            "This job already has inconsistent color modes. Normalize existing file options before updating.",
        });
      }
      console.log(error);
      res.status(500).json({ error: "Failed to update print options." });
    }
  },
);
export default app;
