import { prisma } from "@printowl/db";
import { Job, JobSchema, JobUpdateSchema } from "@printowl/types";
import express from "express";
import multer from "multer";
import {
  calculateEstimatedTime,
  calculateFileCost,
  validateCustomPageRange,
} from "@printowl/shared-utils";
import { optionsSchema } from "@printowl/types";
import socket from "../config/socket.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import type { ExtendedRequest } from "../middleware/authMiddleware.js";
import {
  analyzePrintJob,
  PrintJobAnalysisError,
} from "../utils/printJobAnalysis.js";
import { getPdfPageCountFromBuffer } from "../utils/pdfPageCount.js";
import {
  buildR2ObjectKey,
  deleteObjectFromR2ByUrl,
  uploadBufferToR2,
} from "../utils/r2Storage.js";
import { verifyTurnstileToken } from "../utils/turnstileVerification.js";
import { PrintJobStatus } from "../../../../packages/db/dist/generated/prisma/enums.js";

const app = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 20,
    fileSize: Number(process.env.MAX_UPLOAD_MB ?? 50) * 1024 * 1024,
  },
});

function mapStatus(
  status: "PROCESSING" | "PENDING" | "COMPLETED" | "REJECTED" | "FAILED",
) {
  switch (status) {
    case "PENDING":
      return PrintJobStatus.PENDING;
    case "PROCESSING":
      return PrintJobStatus.PROCESSING;
    case "COMPLETED":
      return PrintJobStatus.COMPLETED;
    case "REJECTED":
      return PrintJobStatus.REJECTED;
    case "FAILED":
      return PrintJobStatus.FAILED;
  }
}

function mapColorMode(colorMode: "BW" | "COLOR") {
  return colorMode;
}

function mapPageRange(pageRange: "ALL" | "CUSTOM") {
  return pageRange;
}

function mapDuplex(duplex: "ONE" | "BOTH") {
  return duplex;
}

function mapOrientation(orientation: "PORTRAIT" | "LANDSCAPE") {
  return orientation;
}

function mapScaleMode(scaleMode: "FIT" | "SHRINK" | "NOSCALE") {
  return scaleMode;
}

async function buildPrintJobCreateData(job: Job, userId: string) {
  const analyzedJob = await analyzePrintJob(job);

  return {
    userId: userId,
    totalCost: analyzedJob.totalCost,
    totalPages: analyzedJob.totalPages,
    estimatedTime: analyzedJob.estimatedTime,
    status: mapStatus(job.status),
    files: {
      create: analyzedJob.files.map((file) => ({
        name: file.name,
        pages: file.pages,
        url: file.url,
        option: {
          create: {
            paperSize: "A4" as const,
            colorMode: mapColorMode(file.option.colorMode),
            orientation: mapOrientation(file.option.orientation),
            scaleMode: mapScaleMode(file.option.scaleMode),
            pageRange: mapPageRange(file.option.pageRange),
            customRange: file.option.customRange,
            duplex: mapDuplex(file.option.duplex),
            copies: file.option.copies,
          },
        },
      })),
    },
  };
}

type UploadedFileForCreate = {
  name: string;
  url: string;
  pages: number;
  cost: number;
  option: Job["files"][number]["option"];
};

function buildPrintJobCreateDataFromProcessedFiles(
  files: UploadedFileForCreate[],
  userId: string,
) {
  const totalPages = files.reduce((sum, file) => sum + file.pages, 0);
  const totalCost = files.reduce((sum, file) => sum + file.cost, 0);

  return {
    userId,
    totalCost,
    totalPages,
    estimatedTime: calculateEstimatedTime(totalPages),
    status: mapStatus("PENDING"),
    files: {
      create: files.map((file) => ({
        name: file.name,
        pages: file.pages,
        url: file.url,
        option: {
          create: {
            paperSize: "A4" as const,
            colorMode: mapColorMode(file.option.colorMode),
            orientation: mapOrientation(file.option.orientation),
            scaleMode: mapScaleMode(file.option.scaleMode),
            pageRange: mapPageRange(file.option.pageRange),
            customRange: file.option.customRange,
            duplex: mapDuplex(file.option.duplex),
            copies: file.option.copies,
          },
        },
      })),
    },
  };
}

function parseFileOptionsFromBody(rawFileOptions: unknown) {
  if (typeof rawFileOptions !== "string") {
    throw new PrintJobAnalysisError("fileOptions is required.", 400);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawFileOptions);
  } catch {
    throw new PrintJobAnalysisError(
      "fileOptions must be valid JSON array.",
      400,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new PrintJobAnalysisError("fileOptions must be an array.", 400);
  }

  return parsed.map((item, index) => {
    const result = optionsSchema.safeParse(item);
    if (!result.success) {
      throw new PrintJobAnalysisError(
        `Invalid print options for file ${index + 1}.`,
        400,
      );
    }

    return result.data;
  });
}

function assertSingleColorModeInOptions(
  options: Array<{ colorMode: "BW" | "COLOR" }>,
) {
  if (!options.length) return;

  const firstMode = options[0]!.colorMode;
  const hasMismatch = options.some((opt) => opt.colorMode !== firstMode);

  if (hasMismatch) {
    throw new PrintJobAnalysisError(
      "All files in a job must use the same color mode (either all B/W or all Color).",
      400,
    );
  }
}

app.post(
  "/create-with-files",
  authMiddleware(["admin", "customer"]),
  upload.array("files"),
  async (req: ExtendedRequest, res) => {
    const incomingFiles = (req.files ?? []) as Express.Multer.File[];
    if (!incomingFiles.length) {
      return res
        .status(400)
        .json({ error: "At least one PDF file is required." });
    }

    if (!req.user?.uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Verify CAPTCHA token
    const captchaToken = req.body.captchaToken;
    if (captchaToken) {
      const captchaVerification = await verifyTurnstileToken(captchaToken);
      if (!captchaVerification.success) {
        return res.status(400).json({
          error: captchaVerification.error || "CAPTCHA verification failed",
        });
      }
    }

    try {
      const fileOptions = parseFileOptionsFromBody(req.body.fileOptions);
      assertSingleColorModeInOptions(fileOptions);

      if (fileOptions.length !== incomingFiles.length) {
        return res.status(400).json({
          error:
            "files and fileOptions length mismatch. Provide one options object per file.",
        });
      }

      const uploadedFiles: UploadedFileForCreate[] = [];

      for (let index = 0; index < incomingFiles.length; index++) {
        const file = incomingFiles[index]!;
        const options = fileOptions[index]!;

        if (file.mimetype !== "application/pdf") {
          return res.status(400).json({
            error: `${file.originalname} is not a PDF. Only PDF files are allowed.`,
          });
        }

        let pages: number;
        try {
          pages = await getPdfPageCountFromBuffer(file.buffer);
        } catch {
          return res.status(400).json({
            error: `Unable to inspect ${file.originalname}. Only valid PDF files can be submitted.`,
          });
        }

        if (options.pageRange === "CUSTOM") {
          const rangeError = validateCustomPageRange(
            options.customRange ?? "",
            pages,
          );

          if (rangeError) {
            return res.status(400).json({
              error: `${file.originalname}: ${rangeError}`,
            });
          }
        }

        const cost = calculateFileCost(pages, {
          paperSize: options.paperSize,
          colorMode: options.colorMode,
          orientation: options.orientation,
          scaleMode: options.scaleMode,
          pageRange: options.pageRange,
          customRange: options.customRange,
          duplex: options.duplex,
          copies: options.copies,
        });

        const key = buildR2ObjectKey(req.user.uid, file.originalname);
        const { url } = await uploadBufferToR2({
          key,
          buffer: file.buffer,
          contentType: file.mimetype || "application/pdf",
        });

        uploadedFiles.push({
          name: file.originalname,
          url,
          pages,
          cost,
          option: {
            paperSize: options.paperSize,
            colorMode: options.colorMode,
            orientation: options.orientation,
            scaleMode: options.scaleMode,
            pageRange: options.pageRange,
            customRange: options.customRange,
            duplex: options.duplex,
            copies: options.copies,
          },
        });
      }

      const createdJob = await prisma.printJob.create({
        data: buildPrintJobCreateDataFromProcessedFiles(
          uploadedFiles,
          req.user.uid,
        ),
      });

      return res.status(201).json({
        message: "Job created successfully!",
        verificationCode: createdJob.verificationCode,
      });
    } catch (error) {
      if (error instanceof PrintJobAnalysisError) {
        return res.status(error.statusCode).json({ error: error.message });
      }

      return res.status(500).json({ error: "Failed to create job." });
    } finally {
      console.log("Emitting job-created event to admin room");
      socket.emit("job-created", "admin");
    }
  },
);

app.post(
  "/create",
  authMiddleware(["admin", "customer"]),
  async (req: ExtendedRequest, res) => {
    const schema = JobSchema.safeParse({ ...req.body });
    if (!schema.success) {
      return res.status(400).json({ error: schema.error });
    }
    const job = schema.data;
    try {
      assertSingleColorModeInOptions(
        job.files.map((file) => ({ colorMode: file.option.colorMode })),
      );
    } catch (error) {
      if (error instanceof PrintJobAnalysisError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      return res
        .status(400)
        .json({ error: "Invalid color mode configuration." });
    }

    try {
      const createdJob = await prisma.printJob.create({
        data: await buildPrintJobCreateData(job, req.user!.uid),
      });
      res.status(201).json({
        message: "Job created successfully!",
        verificationCode: createdJob.verificationCode,
      });
    } catch (error) {
      console.log(error);
      if (error instanceof PrintJobAnalysisError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to create job." });
    } finally {
      socket.emit("job-created", "admin");
    }
  },
);

app.get("/all", authMiddleware(["admin"]), async (req, res) => {
  try {
    const jobs = await prisma.printJob.findMany();
    res.status(200).json(jobs);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Failed to fetch jobs." });
  }
});

app.put("/update-status/:id", authMiddleware(["admin"]), async (req, res) => {
  const { id } = req.params;
  const { status, userId } = req.body;
  const schema = JobUpdateSchema.safeParse({ id, status, userId });
  if (!schema.success) {
    return res.status(400).json({ error: schema.error });
  }
  let job;
  try {
    job = await prisma.printJob.update({
      where: { id: schema.data.id },
      data: { status: mapStatus(status) },
    });
    res.status(200).json(job);
  } catch (error) {
    res.status(500).json({ error: "Failed to update job status." });
  } finally {
    const msg = `Your print job with verification code ${job?.verificationCode} is now ${schema.data.status}.`;
    socket.emit("job-status-updated", schema.data.userId, schema.data.id, msg);
  }
});

app.get(
  "/user-jobs",
  authMiddleware(["customer", "admin"]),
  async (req: ExtendedRequest, res) => {
    console.log("Fetching jobs for user:", req.user!.uid);
    try {
      const jobs = await prisma.printJob.findMany({
        where: { userId: req.user!.uid },
        include: {
          files: {
            include: {
              option: true,
            },
          },
        },
      });
      res.status(200).json(jobs);
    } catch (error) {
      console.log(error);
      res.status(500).json({ error: "Failed to fetch user jobs." });
    }
  },
);

app.get(
  "/:verificationCode",
  authMiddleware(["admin", "customer"]),
  async (req, res) => {
    const { verificationCode } = req.params;
    if (isNaN(Number(verificationCode))) {
      return res
        .status(400)
        .json({ error: "Verification code must be a number." });
    }
    try {
      const job = await prisma.printJob.findFirst({
        where: {
          verificationCode: Number(verificationCode),
        },
        include: {
          files: {
            include: {
              option: true,
            },
          },
        },
      });
      if (!job) {
        return res.status(404).json({ error: "Job not found." });
      }
      res.status(200).json(job);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch job." });
    }
  },
);

app.delete(
  "/delete/:id",
  authMiddleware(["admin", "customer"]),
  async (req: ExtendedRequest, res) => {
    const { id } = req.params;
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "Job ID is required." });
    }
    let job;
    try {
      const existingJob = await prisma.printJob.findUnique({
        where: { id },
        select: {
          id: true,
          userId: true,
          status: true,
          verificationCode: true,
          files: {
            select: {
              id: true,
              url: true,
              optionId: true,
            },
          },
        },
      });

      if (!existingJob) {
        return res.status(404).json({ error: "Job not found." });
      }

      if (req.user.role !== "admin") {
        if (existingJob.userId !== req.user.uid) {
          return res
            .status(403)
            .json({ error: "You can only delete your own jobs." });
        }

        for (const file of existingJob.files) {
          await deleteObjectFromR2ByUrl(file.url);
        }

        const optionIds = existingJob.files.map((file) => file.optionId);

        await prisma.$transaction(async (tx) => {
          await tx.file.deleteMany({
            where: { printJobId: existingJob.id },
          });

          if (optionIds.length) {
            await tx.printOption.deleteMany({
              where: {
                id: { in: optionIds },
              },
            });
          }

          await tx.printJob.delete({
            where: { id: existingJob.id },
          });
        });

        return res.status(200).json({ message: "Job deleted successfully." });
      }

      job = await prisma.printJob.update({
        where: { id: id },
        data: {
          status: PrintJobStatus.REJECTED,
          deleted: true,
        },
      });
      res.status(200).json({ message: "Job canceled successfully." });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete job." });
    } finally {
      if (job) {
        const statusText = PrintJobStatus.REJECTED;
        const msg = `Your print job with verification code ${job.verificationCode} is now ${statusText}.`;
        socket.emit("job-status-updated", job.userId, job.id, msg);
      }
    }
  },
);

app.put(
  "/resubmit/:id",
  authMiddleware(["customer", "admin"]),
  async (req: ExtendedRequest, res) => {
    const { id } = req.params;

    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "Job ID is required." });
    }

    try {
      const existingJob = await prisma.printJob.findUnique({
        where: { id },
        select: {
          id: true,
          userId: true,
          status: true,
          verificationCode: true,
          deleted: true,
        },
      });

      if (!existingJob) {
        return res.status(404).json({ error: "Job not found." });
      }

      if (req.user.role !== "admin" && existingJob.userId !== req.user.uid) {
        return res
          .status(403)
          .json({ error: "You can only resubmit your own jobs." });
      }

      if (existingJob.status !== PrintJobStatus.COMPLETED) {
        return res.status(400).json({
          error: "Only completed jobs can be submitted again.",
        });
      }

      const updated = await prisma.printJob.update({
        where: { id: existingJob.id },
        data: {
          status: PrintJobStatus.PENDING,
          deleted: false,
        },
      });

      const msg = `Your print job with verification code ${updated.verificationCode} is now ${PrintJobStatus.PENDING}.`;
      socket.emit("job-status-updated", updated.userId, updated.id, msg);
      socket.emit("job-created", "admin");

      return res.status(200).json({ message: "Job submitted again." });
    } catch (error) {
      return res.status(500).json({ error: "Failed to resubmit job." });
    }
  },
);

export default app;
