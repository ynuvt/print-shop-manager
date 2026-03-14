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
              copies: fileData.options.copies,
              colorMode:
                fileData.options.colorMode == "COLOR"
                  ? ColorMode.COLOR
                  : ColorMode.BW,
              duplex:
                fileData.options.duplex === "ONE" ? duplex.ONE : duplex.BOTH,
              paperSize: fileData.options.paperSize,
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
        select: { optionId: true },
      });

      if (!file) {
        return res.status(404).json({ error: "File not found" });
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
      console.log(error);
      res.status(500).json({ error: "Failed to update print options." });
    }
  },
);
export default app;
