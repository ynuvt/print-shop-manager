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

const app = express.Router();

app.delete(
  "/",
  authMiddleware(["customer", "admin"]),
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
  authMiddleware(["customer"]),
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

    const schema = optionsSchema.safeParse(req.body);

    if (!schema.success) {
      return res.status(400).json({ error: schema.error.flatten() });
    }

    const optionsData = schema.data;

    try {
      const file = await prisma.file.findUnique({
        where: { id: fileId },
        select: {
          printJobId: true,
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
