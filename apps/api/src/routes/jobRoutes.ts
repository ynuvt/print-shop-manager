import { prisma } from "@printowl/db";
import { Job, JobSchema, JobUpdateSchema } from "@printowl/types";
import express from "express";
import jwt from "jsonwebtoken";
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
  createPresignedUploadUrl,
  deleteObjectFromR2ByUrl,
  uploadBufferToR2,
} from "../utils/r2Storage.js";
import { verifyTurnstileToken } from "../utils/turnstileVerification.js";
import { sendWhatsAppTextMessage } from "../modules/whatsappServices.js";
import { PrintJobStatus } from "../../../../packages/db/dist/generated/prisma/enums.js";
import {
  ColorMode,
  PaperSize,
  duplex,
  orientation as orientationEnum,
  scaleMode as scaleModeEnum,
} from "../../../../packages/db/dist/generated/prisma/client.js";

const app = express.Router();
const CREATE_WITH_FILES_MAX_UPLOAD_MB = 50;
const CREATE_WITH_URLS_MAX_TOTAL_MB = 20;
const CREATE_WITH_URLS_MAX_TOTAL_BYTES =
  CREATE_WITH_URLS_MAX_TOTAL_MB * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 20,
    fileSize: CREATE_WITH_FILES_MAX_UPLOAD_MB * 1024 * 1024,
  },
});

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new PrintJobAnalysisError(
      "JWT_SECRET is missing. Add it to apps/api/.env before starting the API.",
      500,
    );
  }

  return secret;
}

function getOptionalUserFromRequest(req: express.Request) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const token = authHeader.split(" ")[1];
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as {
      uid: string;
      role: string;
      createdAt: number;
    };

    return decoded;
  } catch {
    return null;
  }
}

const uploadFilesMiddleware: express.RequestHandler = (req, res, next) => {
  upload.array("files")(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({
          error: `File too large. Max file size is ${CREATE_WITH_FILES_MAX_UPLOAD_MB} MB.`,
        });
        return;
      }

      if (error.code === "LIMIT_FILE_COUNT") {
        res.status(400).json({ error: "Too many files. Maximum is 20 files." });
        return;
      }

      res.status(400).json({ error: error.message });
      return;
    }

    next(error);
  });
};

function mapStatus(
  status:
    | "PROCESSING"
    | "PENDING"
    | "COMPLETED"
    | "REJECTED"
    | "FAILED"
    | "CANCELED",
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
    case "CANCELED":
      return PrintJobStatus.CANCELED;
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

function mapSource(source: "WEB" | "WHATSAPP") {
  return source;
}

function mapColorModeToEnum(colorMode: "BW" | "COLOR") {
  return colorMode === "COLOR" ? ColorMode.COLOR : ColorMode.BW;
}

function mapPaperSizeToEnum(paperSize: string) {
  void paperSize;
  return PaperSize.A4;
}

function mapOrientationToEnum(orientation: "PORTRAIT" | "LANDSCAPE") {
  return orientation === "LANDSCAPE"
    ? orientationEnum.LANDSCAPE
    : orientationEnum.PORTRAIT;
}

function mapScaleModeToEnum(scaleMode: "FIT" | "SHRINK" | "NOSCALE") {
  if (scaleMode === "NOSCALE") return scaleModeEnum.NOSCALE;
  if (scaleMode === "SHRINK") return scaleModeEnum.SHRINK;
  return scaleModeEnum.FIT;
}

function mapDuplexToEnum(duplexMode: "ONE" | "BOTH") {
  return duplexMode === "ONE" ? duplex.ONE : duplex.BOTH;
}

async function generateUniqueVerificationCode(): Promise<number> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = Math.floor(1000 + Math.random() * 9000);
    const existing = await prisma.printJob.findFirst({
      where: { verificationCode: candidate },
      select: { id: true },
    });

    if (!existing) {
      return candidate;
    }
  }

  throw new PrintJobAnalysisError(
    "Unable to generate a unique verification code.",
    500,
  );
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

async function buildPrintJobCreateDataFromProcessedFiles(
  files: UploadedFileForCreate[],
  userId: string,
) {
  const totalPages = files.reduce((sum, file) => sum + file.pages, 0);
  const totalCost = files.reduce((sum, file) => sum + file.cost, 0);
  const verificationCode = await generateUniqueVerificationCode();

  return {
    userId,
    totalCost,
    totalPages,
    estimatedTime: calculateEstimatedTime(totalPages),
    status: mapStatus("PENDING"),
    verificationCode,
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

type PresignRequestFile = {
  name: string;
  contentType: string;
};

function parsePresignFilesFromBody(rawFiles: unknown): PresignRequestFile[] {
  if (!Array.isArray(rawFiles)) {
    throw new PrintJobAnalysisError("files must be an array.", 400);
  }

  return rawFiles.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new PrintJobAnalysisError(
        `Invalid file payload at index ${index + 1}.`,
        400,
      );
    }

    const name =
      typeof (item as { name?: unknown }).name === "string"
        ? (item as { name: string }).name.trim()
        : "";

    if (!name) {
      throw new PrintJobAnalysisError(
        `Missing file name for file ${index + 1}.`,
        400,
      );
    }

    const contentType =
      typeof (item as { contentType?: unknown }).contentType === "string" &&
      (item as { contentType: string }).contentType.trim()
        ? (item as { contentType: string }).contentType.trim()
        : "application/pdf";

    return { name, contentType };
  });
}

type UrlFileForCreate = {
  name: string;
  url: string;
  options: ReturnType<typeof optionsSchema.parse>;
};

function parseUrlFilesFromBody(rawFiles: unknown): UrlFileForCreate[] {
  if (!Array.isArray(rawFiles)) {
    throw new PrintJobAnalysisError("files must be an array.", 400);
  }

  return rawFiles.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new PrintJobAnalysisError(
        `Invalid file payload at index ${index + 1}.`,
        400,
      );
    }

    const name =
      typeof (item as { name?: unknown }).name === "string"
        ? (item as { name: string }).name.trim()
        : "";
    const url =
      typeof (item as { url?: unknown }).url === "string"
        ? (item as { url: string }).url.trim()
        : "";

    if (!name || !url) {
      throw new PrintJobAnalysisError(
        `Missing name or url for file ${index + 1}.`,
        400,
      );
    }

    try {
      new URL(url);
    } catch {
      throw new PrintJobAnalysisError(
        `Invalid url for file ${index + 1}.`,
        400,
      );
    }

    const optionsResult = optionsSchema.safeParse(
      (item as { options?: unknown }).options,
    );
    if (!optionsResult.success) {
      throw new PrintJobAnalysisError(
        `Invalid print options for file ${index + 1}.`,
        400,
      );
    }

    return { name, url, options: optionsResult.data };
  });
}

type UrlFileForAppend = {
  name: string;
  url: string;
};

function parseUrlFilesForAppend(rawFiles: unknown): UrlFileForAppend[] {
  if (!Array.isArray(rawFiles)) {
    throw new PrintJobAnalysisError("files must be an array.", 400);
  }

  return rawFiles.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new PrintJobAnalysisError(
        `Invalid file payload at index ${index + 1}.`,
        400,
      );
    }

    const name =
      typeof (item as { name?: unknown }).name === "string"
        ? (item as { name: string }).name.trim()
        : "";
    const url =
      typeof (item as { url?: unknown }).url === "string"
        ? (item as { url: string }).url.trim()
        : "";

    if (!name || !url) {
      throw new PrintJobAnalysisError(
        `Missing name or url for file ${index + 1}.`,
        400,
      );
    }

    try {
      new URL(url);
    } catch {
      throw new PrintJobAnalysisError(
        `Invalid url for file ${index + 1}.`,
        400,
      );
    }

    return { name, url };
  });
}

/*
 * Legacy upload flow (direct file upload to backend):
 * Disabled in favor of presigned client uploads + create-with-urls.
 */
// app.post(
//   "/create-with-files",
//   authMiddleware(["admin", "customer"]),
//   uploadFilesMiddleware,
//   async (req: ExtendedRequest, res) => {
//     const incomingFiles = (req.files ?? []) as Express.Multer.File[];
//     if (!incomingFiles.length) {
//       return res
//         .status(400)
//         .json({ error: "At least one PDF file is required." });
//     }
//
//     if (!req.user?.uid) {
//       return res.status(401).json({ error: "Unauthorized" });
//     }
//
//     // Verify CAPTCHA token
//     const captchaToken = req.body.captchaToken;
//     if (captchaToken) {
//       const captchaVerification = await verifyTurnstileToken(captchaToken);
//       if (!captchaVerification.success) {
//         return res.status(400).json({
//           error: captchaVerification.error || "CAPTCHA verification failed",
//         });
//       }
//     }
//
//     try {
//       const fileOptions = parseFileOptionsFromBody(req.body.fileOptions);
//       assertSingleColorModeInOptions(fileOptions);
//
//       if (fileOptions.length !== incomingFiles.length) {
//         return res.status(400).json({
//           error:
//             "files and fileOptions length mismatch. Provide one options object per file.",
//         });
//       }
//
//       const uploadedFiles: UploadedFileForCreate[] = [];
//
//       for (let index = 0; index < incomingFiles.length; index++) {
//         const file = incomingFiles[index]!;
//         const options = fileOptions[index]!;
//
//         if (file.mimetype !== "application/pdf") {
//           return res.status(400).json({
//             error: `${file.originalname} is not a PDF. Only PDF files are allowed.`,
//           });
//         }
//
//         let pages: number;
//         try {
//           pages = await getPdfPageCountFromBuffer(file.buffer);
//         } catch {
//           return res.status(400).json({
//             error: `Unable to inspect ${file.originalname}. Only valid PDF files can be submitted.`,
//           });
//         }
//
//         if (options.pageRange === "CUSTOM") {
//           const rangeError = validateCustomPageRange(
//             options.customRange ?? "",
//             pages,
//           );
//
//           if (rangeError) {
//             return res.status(400).json({
//               error: `${file.originalname}: ${rangeError}`,
//             });
//           }
//         }
//
//         const cost = calculateFileCost(pages, {
//           paperSize: options.paperSize,
//           colorMode: options.colorMode,
//           orientation: options.orientation,
//           scaleMode: options.scaleMode,
//           pageRange: options.pageRange,
//           customRange: options.customRange,
//           duplex: options.duplex,
//           copies: options.copies,
//         });
//
//         const key = buildR2ObjectKey(req.user.uid, file.originalname);
//         const { url } = await uploadBufferToR2({
//           key,
//           buffer: file.buffer,
//           contentType: file.mimetype || "application/pdf",
//         });
//
//         uploadedFiles.push({
//           name: file.originalname,
//           url,
//           pages,
//           cost,
//           option: {
//             paperSize: options.paperSize,
//             colorMode: options.colorMode,
//             orientation: options.orientation,
//             scaleMode: options.scaleMode,
//             pageRange: options.pageRange,
//             customRange: options.customRange,
//             duplex: options.duplex,
//             copies: options.copies,
//           },
//         });
//       }
//
//       const createdJob = await prisma.printJob.create({
//         data: buildPrintJobCreateDataFromProcessedFiles(
//           uploadedFiles,
//           req.user.uid,
//         ),
//       });
//
//       return res.status(201).json({
//         message: "Job created successfully!",
//         verificationCode: createdJob.verificationCode,
//       });
//     } catch (error) {
//       if (error instanceof PrintJobAnalysisError) {
//         return res.status(error.statusCode).json({ error: error.message });
//       }
//
//       return res.status(500).json({ error: "Failed to create job." });
//     } finally {
//       console.log("Emitting job-created event to admin room");
//       socket.emit("job-created", "admin");
//     }
//   },
// );

app.post(
  "/presign-uploads",
  authMiddleware(["admin", "customer"]),
  async (req: ExtendedRequest, res) => {
    if (!req.user?.uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const files = parsePresignFilesFromBody(req.body.files);

      if (!files.length) {
        return res
          .status(400)
          .json({ error: "At least one file is required." });
      }

      const ALLOWED_CONTENT_TYPES = new Set([
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/bmp",
        "image/tiff",
        "image/webp",
      ]);

      const ALLOWED_EXTENSIONS = /\.(pdf|docx?|pptx?|jpe?g|png|gif|bmp|tiff?|webp)$/i;

      const uploads = await Promise.all(
        files.map(async (file) => {
          const nameMatch = ALLOWED_EXTENSIONS.test(file.name);
          const typeMatch = ALLOWED_CONTENT_TYPES.has(file.contentType);

          if (!nameMatch && !typeMatch) {
            throw new PrintJobAnalysisError(
              `${file.name} is not a supported file type. Supported: PDF, Word, PowerPoint, and images (JPG, PNG, GIF, BMP, TIFF, WebP).`,
              400,
            );
          }

          const key = buildR2ObjectKey(req.user!.uid, file.name);
          const presigned = await createPresignedUploadUrl({
            key,
            contentType: file.contentType || "application/octet-stream",
          });

          return {
            name: file.name,
            key: presigned.key,
            uploadUrl: presigned.uploadUrl,
            publicUrl: presigned.publicUrl,
          };
        }),
      );

      return res.status(200).json({ uploads });
    } catch (error) {
      if (error instanceof PrintJobAnalysisError) {
        return res.status(error.statusCode).json({ error: error.message });
      }

      return res.status(500).json({ error: "Failed to prepare uploads." });
    }
  },
);

app.post(
  "/create-with-urls",
  authMiddleware(["admin", "customer"]),
  async (req: ExtendedRequest, res) => {
    if (!req.user?.uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }



    let incomingFiles: UrlFileForCreate[] = [];

    try {
      incomingFiles = parseUrlFilesFromBody(req.body.files);

      if (!incomingFiles.length) {
        return res
          .status(400)
          .json({ error: "At least one PDF file is required." });
      }

      const uploadedFiles: UploadedFileForCreate[] = [];
      let totalBytes = 0;

      for (const file of incomingFiles) {
        const response = await fetch(file.url);
        if (!response.ok) {
          throw new PrintJobAnalysisError(
            `Unable to fetch ${file.name} from storage. Please re-upload and try again.`,
            502,
          );
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        totalBytes += buffer.byteLength;

        if (totalBytes > CREATE_WITH_URLS_MAX_TOTAL_BYTES) {
          throw new PrintJobAnalysisError(
            `Total upload too large. Max combined size is ${CREATE_WITH_URLS_MAX_TOTAL_MB} MB.`,
            413,
          );
        }

        let pages: number;
        try {
          pages = await getPdfPageCountFromBuffer(buffer);
        } catch {
          throw new PrintJobAnalysisError(
            `Unable to inspect ${file.name}. Only valid PDF files can be submitted.`,
            400,
          );
        }

        if (file.options.pageRange === "CUSTOM") {
          const rangeError = validateCustomPageRange(
            file.options.customRange ?? "",
            pages,
          );

          if (rangeError) {
            throw new PrintJobAnalysisError(`${file.name}: ${rangeError}`, 400);
          }
        }

        const cost = calculateFileCost(pages, {
          paperSize: file.options.paperSize,
          colorMode: file.options.colorMode,
          orientation: file.options.orientation,
          scaleMode: file.options.scaleMode,
          pageRange: file.options.pageRange,
          customRange: file.options.customRange,
          duplex: file.options.duplex,
          copies: file.options.copies,
        });

        uploadedFiles.push({
          name: file.name,
          url: file.url,
          pages,
          cost,
          option: {
            paperSize: file.options.paperSize,
            colorMode: file.options.colorMode,
            orientation: file.options.orientation,
            scaleMode: file.options.scaleMode,
            pageRange: file.options.pageRange,
            customRange: file.options.customRange,
            duplex: file.options.duplex,
            copies: file.options.copies,
          },
        });
      }

      const createdJob = await prisma.printJob.create({
        data: await buildPrintJobCreateDataFromProcessedFiles(
          uploadedFiles,
          req.user.uid,
        ),
      });

      return res.status(201).json({
        message: "Job created successfully!",
        verificationCode: createdJob.verificationCode,
      });
    } catch (error) {
      await Promise.allSettled(
        incomingFiles.map((file) => deleteObjectFromR2ByUrl(file.url)),
      );

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

app.get(
  "/web-draft",
  authMiddleware(["customer", "admin"]),
  async (req: ExtendedRequest, res) => {
    if (!req.user?.uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const job = await prisma.printJob.findFirst({
        where: {
          userId: req.user.uid,
          status: PrintJobStatus.DRAFT,
        },
        include: {
          files: {
            include: {
              option: true,
            },
            orderBy: { createdAt: "asc" },
          },
        },
      });

      return res.status(200).json(job);
    } catch (error) {
      return res.status(500).json({ error: "Failed to fetch web draft." });
    }
  },
);

app.post(
  "/web-draft/add-files",
  authMiddleware(["customer", "admin"]),
  async (req: ExtendedRequest, res) => {
    if (!req.user?.uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    let incomingFiles: UrlFileForAppend[] = [];

    try {
      incomingFiles = parseUrlFilesForAppend(req.body.files);
      if (!incomingFiles.length) {
        return res
          .status(400)
          .json({ error: "At least one file is required." });
      }

      let job = await prisma.printJob.findFirst({
        where: {
          userId: req.user.uid,
          status: PrintJobStatus.DRAFT,
        },
        include: { _count: { select: { files: true } } },
      });

      if (job && job._count.files + incomingFiles.length > 15) {
        return res.status(400).json({ error: "You cannot add more than 15 files to a job." });
      } else if (!job && incomingFiles.length > 15) {
        return res.status(400).json({ error: "You cannot add more than 15 files to a job." });
      }

      if (!job) {
        job = await prisma.printJob.create({
          data: {
            userId: req.user.uid,
            status: PrintJobStatus.DRAFT,
            source: "WEB",
            totalCost: 0,
            totalPages: 0,
            estimatedTime: 0,
          },
          include: { _count: { select: { files: true } } },
        });
      }

      const defaultOptions = optionsSchema.parse({
        paperSize: "A4",
        colorMode: "BW",
        orientation: "PORTRAIT",
        scaleMode: "FIT",
        pageRange: "ALL",
        customRange: "",
        duplex: "ONE",
        copies: 1,
      });

      const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|bmp|tiff?|webp)$/i;
      const OFFICE_EXTENSIONS = /\.(docx?|pptx?)$/i;

      const processedFiles: UploadedFileForCreate[] = [];
      let totalBytes = 0;

      for (const file of incomingFiles) {
        const response = await fetch(file.url);
        if (!response.ok) {
          throw new PrintJobAnalysisError(
            `Unable to fetch ${file.name} from storage. Please re-upload and try again.`,
            502,
          );
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        totalBytes += buffer.byteLength;

        if (totalBytes > CREATE_WITH_URLS_MAX_TOTAL_BYTES) {
          throw new PrintJobAnalysisError(
            `Total upload too large. Max combined size is ${CREATE_WITH_URLS_MAX_TOTAL_MB} MB.`,
            413,
          );
        }

        const isImage = IMAGE_EXTENSIONS.test(file.name);
        const isOffice = OFFICE_EXTENSIONS.test(file.name);

        let finalUrl = file.url;
        let finalName = file.name;
        let pages: number;

        if (isImage) {
          // Images: keep as-is, SumatraPDF can print them directly. 1 page per image.
          pages = 1;
        } else if (isOffice) {
          // Word/PPT: convert to PDF server-side using LibreOffice
          const { convertToPdfFromBuffer } = await import("../utils/convertToPdf.js");
          const converted = await convertToPdfFromBuffer(buffer, file.name);

          // Strip office extension and add .pdf
          let baseName = file.name.replace(/\.(docx?|pptx?)$/i, "");
          if (!baseName.trim()) baseName = "document";
          finalName = `${baseName}.pdf`;

          // Upload the converted PDF to R2
          const key = buildR2ObjectKey(req.user!.uid, finalName);
          const uploaded = await uploadBufferToR2({
            key,
            buffer: converted.pdfBuffer,
            contentType: "application/pdf",
          });
          finalUrl = uploaded.url;

          // Delete the original non-PDF from R2
          await deleteObjectFromR2ByUrl(file.url).catch(() => {});

          pages = await getPdfPageCountFromBuffer(converted.pdfBuffer);
        } else {
          // PDF: existing logic
          pages = await getPdfPageCountFromBuffer(buffer);
        }

        const cost = calculateFileCost(pages, {
          ...defaultOptions,
        });

        processedFiles.push({
          name: finalName,
          url: finalUrl,
          pages,
          cost,
          option: defaultOptions,
        });
      }

      await prisma.$transaction(async (tx) => {
        for (const file of processedFiles) {
          await tx.file.create({
            data: {
              name: file.name,
              pages: file.pages,
              url: file.url,
              fileCost: file.cost,
              printJobId: job!.id,
              uploadedByUserId: req.user!.uid,
              uploadedByRole: "OWNER",
              option: {
                create: {
                  paperSize: mapPaperSizeToEnum(file.option.paperSize),
                  colorMode: mapColorModeToEnum(file.option.colorMode),
                  orientation: mapOrientationToEnum(file.option.orientation),
                  scaleMode: mapScaleModeToEnum(file.option.scaleMode),
                  duplex: mapDuplexToEnum(file.option.duplex),
                  pageRange: mapPageRange(file.option.pageRange),
                  customRange: file.option.customRange,
                  copies: file.option.copies,
                },
              },
            },
          });
        }

        const allFiles = await tx.file.findMany({
          where: { printJobId: job!.id },
          include: { option: true },
        });

        const newTotalPages = allFiles.reduce((sum, f) => sum + f.pages, 0);
        const newTotalCost = allFiles.reduce((sum, f) => {
          const opt = f.option!;
          return sum + calculateFileCost(f.pages, {
            paperSize: "A4",
            colorMode: opt.colorMode === "COLOR" ? "COLOR" : "BW",
            orientation: opt.orientation === "LANDSCAPE" ? "LANDSCAPE" : "PORTRAIT",
            scaleMode: opt.scaleMode === "SHRINK" ? "SHRINK" : opt.scaleMode === "NOSCALE" ? "NOSCALE" : "FIT",
            pageRange: opt.pageRange === "CUSTOM" ? "CUSTOM" : "ALL",
            customRange: opt.customRange || "",
            duplex: opt.duplex === "BOTH" ? "BOTH" : "ONE",
            copies: opt.copies,
          });
        }, 0);

        await tx.printJob.update({
          where: { id: job!.id },
          data: {
            totalPages: newTotalPages,
            totalCost: newTotalCost,
            estimatedTime: calculateEstimatedTime(newTotalPages),
          },
        });
      });

      const updatedJob = await prisma.printJob.findUnique({
        where: { id: job!.id },
        include: {
          files: {
            include: {
              option: true,
            },
            orderBy: { createdAt: "asc" },
          },
        },
      });

      return res.status(200).json({ job: updatedJob });
    } catch (error) {
      if (error instanceof PrintJobAnalysisError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      return res.status(500).json({ error: "Failed to append files." });
    }
  },
);

app.post(
  "/:jobId/add-files-from-urls",
  authMiddleware(["customer", "admin"]),
  async (req: ExtendedRequest, res) => {
    const { jobId } = req.params;
    if (!jobId || typeof jobId !== "string") {
      return res.status(400).json({ error: "Job ID is required." });
    } 

    if (!req.user?.uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    let incomingFiles: UrlFileForAppend[] = [];

    try {
      incomingFiles = parseUrlFilesForAppend(req.body.files);
      if (!incomingFiles.length) {
        return res
          .status(400)
          .json({ error: "At least one PDF file is required." });
      }

      const job = await prisma.printJob.findUnique({
        where: { id: jobId },
        include: {
          owners: { select: { userId: true } },
          _count: { select: { files: true } },
        },
      });

      if (!job) {
        return res.status(404).json({ error: "Job not found." });
      }

      if (job.status !== PrintJobStatus.DRAFT) {
        return res
          .status(403)
          .json({ error: "This job is not available for review." });
      }

      if (job._count.files + incomingFiles.length > 15) {
        return res.status(400).json({ error: "You cannot add more than 15 files to a job." });
      }

      const viewerId = req.user!.uid;
      const isOwner = job.userId === viewerId;

      // Check if viewer is a known collaborator (has accessed the review link before)
      const isCollaborator = !isOwner && job.owners.some((o) => o.userId === viewerId);
      
      if (!isOwner && !isCollaborator) {
        // Auto-register as collaborator if they have the review link
        await prisma.printJobOwner.upsert({
          where: { userId_printJobId: { userId: viewerId, printJobId: job.id } },
          update: {},
          create: { userId: viewerId, printJobId: job.id },
        });
      }

      // Resolve uploader display info
      const linkedWa = await prisma.whatsAppUser.findFirst({
        where: { userId: viewerId },
        select: { phoneNumber: true, name: true },
      });
      const uploaderRole = isOwner ? "OWNER" as const : "COLLABORATOR" as const;
      const uploaderDisplayName = linkedWa?.name || linkedWa?.phoneNumber || "Collaborator";

      const defaultOptions = optionsSchema.parse({
        paperSize: "A4",
        colorMode: "BW",
        orientation: "PORTRAIT",
        scaleMode: "FIT",
        pageRange: "ALL",
        customRange: "",
        duplex: "ONE",
        copies: 1,
      });

      const processedFiles: UploadedFileForCreate[] = [];
      let totalBytes = 0;

      for (const file of incomingFiles) {
        const response = await fetch(file.url);
        if (!response.ok) {
          throw new PrintJobAnalysisError(
            `Unable to fetch ${file.name} from storage. Please re-upload and try again.`,
            502,
          );
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        totalBytes += buffer.byteLength;

        if (totalBytes > CREATE_WITH_URLS_MAX_TOTAL_BYTES) {
          throw new PrintJobAnalysisError(
            `Total upload too large. Max combined size is ${CREATE_WITH_URLS_MAX_TOTAL_MB} MB.`,
            413,
          );
        }

        let pages: number;
        try {
          pages = await getPdfPageCountFromBuffer(buffer);
        } catch {
          throw new PrintJobAnalysisError(
            `Unable to inspect ${file.name}. Only valid PDF files can be submitted.`,
            400,
          );
        }

        const cost = calculateFileCost(pages, {
          paperSize: defaultOptions.paperSize,
          colorMode: defaultOptions.colorMode,
          orientation: defaultOptions.orientation,
          scaleMode: defaultOptions.scaleMode,
          pageRange: defaultOptions.pageRange,
          customRange: defaultOptions.customRange,
          duplex: defaultOptions.duplex,
          copies: defaultOptions.copies,
        });

        processedFiles.push({
          name: file.name,
          url: file.url,
          pages,
          cost,
          option: defaultOptions,
        });
      }

      const addedPages = processedFiles.reduce(
        (sum, file) => sum + file.pages,
        0,
      );
      const addedCost = processedFiles.reduce(
        (sum, file) => sum + file.cost,
        0,
      );

      await prisma.$transaction(async (tx) => {
        for (const file of processedFiles) {
          await tx.file.create({
            data: {
              name: file.name,
              pages: file.pages,
              url: file.url,
              fileCost: file.cost,
              printJobId: jobId,
              uploadedByUserId: viewerId,
              uploadedByPhoneNumber: linkedWa?.phoneNumber ?? null,
              uploadedByDisplayName: uploaderDisplayName,
              uploadedByRole: uploaderRole,
              option: {
                create: {
                  paperSize: file.option.paperSize,
                  colorMode: mapColorMode(file.option.colorMode),
                  orientation: mapOrientation(file.option.orientation),
                  scaleMode: mapScaleMode(file.option.scaleMode),
                  pageRange: mapPageRange(file.option.pageRange),
                  customRange: file.option.customRange,
                  duplex: mapDuplex(file.option.duplex),
                  copies: file.option.copies,
                },
              },
            },
          });
        }

        const nextTotalPages = (job.totalPages ?? 0) + addedPages;
        const nextTotalCost = (job.totalCost ?? 0) + addedCost;

        await tx.printJob.update({
          where: { id: jobId },
          data: {
            totalPages: nextTotalPages,
            totalCost: nextTotalCost,
            estimatedTime: calculateEstimatedTime(nextTotalPages),
          },
        });
      });

      socket.emit("job-file-added", jobId);

      return res.status(200).json({
        addedFilesCount: processedFiles.length,
        addedPages,
        addedCost,
      });
    } catch (error) {
      await Promise.allSettled(
        incomingFiles.map((file) => deleteObjectFromR2ByUrl(file.url)),
      );

      if (error instanceof PrintJobAnalysisError) {
        return res.status(error.statusCode).json({ error: error.message });
      }

      return res.status(500).json({ error: "Failed to add files." });
    }
  },
);

// app.post(
//   "/create",
//   authMiddleware(["admin", "customer"]),
//   async (req: ExtendedRequest, res) => {
//     const schema = JobSchema.safeParse({ ...req.body });
//     if (!schema.success) {
//       return res.status(400).json({ error: schema.error });
//     }
//     const job = schema.data;
//     try {
//       assertSingleColorModeInOptions(
//         job.files.map((file) => ({ colorMode: file.option.colorMode })),
//       );
//     } catch (error) {
//       if (error instanceof PrintJobAnalysisError) {
//         return res.status(error.statusCode).json({ error: error.message });
//       }
//       return res
//         .status(400)
//         .json({ error: "Invalid color mode configuration." });
//     }

//     try {
//       const createdJob = await prisma.printJob.create({
//         data: await buildPrintJobCreateData(job, req.user!.uid),
//       });
//       res.status(201).json({
//         message: "Job created successfully!",
//         verificationCode: createdJob.verificationCode,
//       });
//     } catch (error) {
//       console.log(error);
//       if (error instanceof PrintJobAnalysisError) {
//         return res.status(error.statusCode).json({ error: error.message });
//       }
//       res.status(500).json({ error: "Failed to create job." });
//     } finally {
//       socket.emit("job-created", "admin");
//     }
//   },
// );

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
      include: {
        files: {
          select: { url: true },
        },
      },
    });

    if (status === "REJECTED" || status === "CANCELED") {
      await Promise.allSettled(
        job.files.map((file) => deleteObjectFromR2ByUrl(file.url)),
      );
    }

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
    if (!req.user?.uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      console.log("Fetching jobs for user:", req.user.uid);
      const linked = await prisma.whatsAppUser.findFirst({
        where: { userId: req.user.uid },
        select: { phoneNumber: true },
      });
      const viewerPhone = linked?.phoneNumber ?? null;

      const jobs = await prisma.printJob.findMany({
        where: {
          OR: [
            { userId: req.user.uid },
            { owners: { some: { userId: req.user.uid } } },
          ],
        },
        include: {
          files: {
            include: {
              option: true,
            },
            orderBy: { createdAt: "asc" },
          },
          owners: { select: { userId: true } },
        },
      });

      const scoped = jobs.map((job) => {
        const isOwner = job.userId === req.user!.uid;
        if (isOwner || job.status !== PrintJobStatus.DRAFT) {
          return job;
        }

        const visibleFiles = job.files.filter((file) => {
          if (file.uploadedByUserId && file.uploadedByUserId === req.user!.uid) {
            return true;
          }
          if (
            viewerPhone &&
            file.uploadedByPhoneNumber &&
            file.uploadedByPhoneNumber === viewerPhone
          ) {
            return true;
          }
          return false;
        });

        const { totalCost: _tc, totalPages: _tp, estimatedTime: _et, ...safeJob } =
          job as any;
        return {
          ...safeJob,
          files: visibleFiles,
        };
      });

      res.status(200).json(scoped);
    } catch (error) {
      console.log(error);
      res.status(500).json({ error: "Failed to fetch user jobs." });
    }
  },
);

app.post(
  "/resync-whatsapp",
  authMiddleware(["customer", "admin"]),
  async (req: ExtendedRequest, res) => {
    try {
    if (!req.user?.uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const linked = await prisma.whatsAppUser.findFirst({
      where: { userId: req.user.uid },
      select: { phoneNumber: true },
    });

    if (!linked?.phoneNumber) {
      return res.status(400).json({
        error: "Please sync your WhatsApp account before syncing jobs.",
      });
    }

    const result = await prisma.printJob.updateMany({
      where: {
        userMetadataId: linked.phoneNumber,
        status: { not: PrintJobStatus.DRAFT },
      },
      data: { userId: req.user.uid },
    });

    return res.status(200).json({ updatedCount: result.count });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Failed to sync jobs." });
  } 
  },
);

app.get("/review/:id", async (req, res) => {
  const { id } = req.params;
  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "Job ID is required." });
  }

  try {
    const job = await prisma.printJob.findFirst({
      where: { id, status: PrintJobStatus.DRAFT },
      include: {
        files: {
          include: {
            option: true,
          },
          orderBy: { createdAt: "asc" },
        },
        userMetadata: true,
        owners: { select: { userId: true, isDone: true } },
      },
    });

    if (!job) {
      return res.status(404).json({ error: "Job not found." });
    }

    const optionalUser = getOptionalUserFromRequest(req);
    if (!optionalUser?.uid) {
      return res.status(401).json({
        error: "Authentication required to review this job.",
        requiresAuth: true,
      });
    }

    // Ensure viewer is recorded as collaborator for link-based flows.
    await prisma.printJobOwner.upsert({
      where: {
        userId_printJobId: {
          userId: optionalUser.uid,
          printJobId: job.id,
        },
      },
      update: {},
      create: {
        userId: optionalUser.uid,
        printJobId: job.id,
      },
    });

    const linked = await prisma.whatsAppUser.findFirst({
      where: { userId: optionalUser.uid },
      select: { phoneNumber: true },
    });
    const viewerPhone = linked?.phoneNumber ?? null;

    const isOwner = job.userId === optionalUser.uid;
    if (!isOwner && !viewerPhone) {
      return res.status(403).json({
        error: "Please sync your WhatsApp account to access this review link.",
        requiresWhatsappSync: true,
      });
    }
    const viewerRole = isOwner ? "OWNER" : "COLLABORATOR";
    const isCollabDone = job.owners.find((o) => o.userId === optionalUser.uid)?.isDone ?? false;

    const visibleFiles = isOwner
      ? job.files.map(f => ({
          ...f,
          uploaderDone: job.owners.find(o => o.userId === f.uploadedByUserId)?.isDone ?? false
        }))
      : job.files.filter((file) => {
          if (file.uploadedByUserId && file.uploadedByUserId === optionalUser.uid) {
            return true;
          }
          if (
            viewerPhone &&
            file.uploadedByPhoneNumber &&
            file.uploadedByPhoneNumber === viewerPhone
          ) {
            return true;
          }
          return false;
        });

    const permissions = isOwner
      ? {
          canViewAllFiles: true,
          canEditAllFiles: true,
          canDeleteAllFiles: true,
          canAddFiles: true,
          canSubmit: true,
        }
      : {
          canViewAllFiles: false,
          canEditAllFiles: false,
          canDeleteAllFiles: false,
          canAddFiles: true,
          canSubmit: true,
        };

    const viewerCost = visibleFiles.reduce(
      (sum, f) => sum + (typeof f.fileCost === "number" ? f.fileCost : 0),
      0,
    );

    if (!isOwner) {
      // Collaborators must not see aggregate totals across other users.
      const { totalCost: _tc, totalPages: _tp, estimatedTime: _et, ...safeJob } =
        job as any;
      return res.status(200).json({
        ...safeJob,
        files: visibleFiles,
        viewerRole,
        permissions,
        viewerCost,
        isCollabDone,
      });
    }

    const perUserMap = new Map<
      string,
      {
        key: string;
        displayName: string;
        role: string;
        cost: number;
      }
    >();

    for (const f of job.files) {
      const key =
        f.uploadedByUserId ||
        f.uploadedByPhoneNumber ||
        f.uploadedByDisplayName ||
        "unknown";
      const displayName = f.uploadedByRole === "OWNER"
        ? "Your Files"
        : (f.uploadedByDisplayName || f.uploadedByPhoneNumber || "Unknown");
      const existing = perUserMap.get(key) ?? {
        key,
        displayName,
        role: f.uploadedByRole,
        cost: 0,
      };
      existing.cost += typeof f.fileCost === "number" ? f.fileCost : 0;
      perUserMap.set(key, existing);
    }

    const perUserCosts = [...perUserMap.values()].sort((a, b) => b.cost - a.cost);
    const totalCost = perUserCosts.reduce((sum, u) => sum + u.cost, 0);

    return res.status(200).json({
      ...job,
      files: visibleFiles,
      viewerRole,
      permissions,
      viewerCost,
      isCollabDone,
      costBreakdown: {
        perUser: perUserCosts,
        totalCost,
      },
    });
  } catch (error) {
    console.error("Error fetching job review details:", error);
    return res.status(500).json({ error: "Failed to fetch job." });
  }
});

app.post(
  "/review/:id/confirm",
  authMiddleware(["customer"]),
  async (req: ExtendedRequest, res) => {
    const { id } = req.params;
    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "Job ID is required." });
    }
    if (!req.user?.uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const viewerId = req.user.uid;

    try {
      const job = await prisma.printJob.findFirst({
        where: { id, status: PrintJobStatus.DRAFT },
        include: {
          files: true,
          owners: { select: { userId: true } },
        },
      });

      if (!job) {
        return res.status(404).json({ error: "Job not found." });
      }

      const isMember =
        job.userId === viewerId || job.owners.some((o) => o.userId === viewerId);
      if (!isMember) {
        return res.status(403).json({ error: "You do not have access to this job." });
      }

      const linked = await prisma.whatsAppUser.findFirst({
        where: { userId: req.user.uid },
        select: { phoneNumber: true },
      });
      const viewerPhone = linked?.phoneNumber ?? null;

      const myFiles = job.files.filter((file) => {
        if (file.uploadedByUserId && file.uploadedByUserId === viewerId) return true;
        if (viewerPhone && file.uploadedByPhoneNumber === viewerPhone) return true;
        return false;
      });

      const userCost = myFiles.reduce(
        (sum, f) => sum + (typeof f.fileCost === "number" ? f.fileCost : 0),
        0,
      );

      const user = await prisma.user.findUnique({
        where: { id: viewerId },
        select: { name: true },
      });

      // Resolve collaborator's WhatsApp display name
      const linkedWa = await prisma.whatsAppUser.findFirst({
        where: { userId: viewerId },
        select: { name: true, phoneNumber: true },
      });
      const collabDisplayName = linkedWa?.name || linkedWa?.phoneNumber || user?.name || "A collaborator";

      socket.emit("job-collaborator-confirmed", id, {
        userId: viewerId,
        displayName: collabDisplayName,
        userCost,
      });

      await prisma.printJobOwner.updateMany({
        where: { printJobId: id, userId: viewerId },
        data: { isDone: true },
      });

      // Notify the job owner via WhatsApp
      if (job.userId) {
        const ownerWa = await prisma.whatsAppUser.findFirst({
          where: { userId: job.userId },
          select: { phoneNumber: true },
        });
        if (ownerWa?.phoneNumber) {
          const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
          if (phoneNumberId) {
            try {
              await sendWhatsAppTextMessage({
                to: ownerWa.phoneNumber,
                phoneNumberId,
                message: [
                  `*${collabDisplayName}* has finished adding files.`,
                  "",
                  `Their files total: *Rs ${userCost}*`,
                  "",
                  `You can now review and submit the job.`,
                  "",
                  `Type *"EDIT"* to open the review link.`,
                ].join("\n"),
              });
            } catch (err) {
              console.error("Failed to notify owner via WhatsApp:", err);
            }
          } else {
            console.error("Missing WHATSAPP_PHONE_NUMBER_ID in env, cannot send 'I'm done' message.");
          }
        }
      }

      return res.status(200).json({ message: "Confirmed.", userCost });
    } catch (error) {
      console.error("review confirm failed:", error);
      return res.status(500).json({ error: "Failed to confirm files." });
    }
  },
);

app.post(
  "/submit-whatsapp-job",
  authMiddleware(["customer"]),
  async (req: ExtendedRequest, res) => {
    const { jobId, files } = req.body as {
      jobId?: string;
      files?: Array<{ id: string; options: unknown }>;
    };
    const userId = req.user!.uid;

    if (!jobId || typeof jobId !== "string") {
      return res.status(400).json({ error: "Job ID is required." });
    }

    if (!Array.isArray(files) || !files.length) {
      return res.status(400).json({ error: "At least one file is required." });
    }

    let parsedFiles: Array<{
      id: string;
      options: ReturnType<typeof optionsSchema.parse>;
    }> = [];

    try {
      parsedFiles = files.map((file, index) => {
        if (!file || typeof file !== "object") {
          throw new PrintJobAnalysisError(
            `Invalid file payload at index ${index + 1}.`,
            400,
          );
        }

        const fileId =
          typeof (file as { id?: unknown }).id === "string"
            ? (file as { id: string }).id.trim()
            : "";

        if (!fileId) {
          throw new PrintJobAnalysisError(
            `Missing file id at index ${index + 1}.`,
            400,
          );
        }

        const optionsResult = optionsSchema.safeParse(
          (file as { options?: unknown }).options,
        );

        if (!optionsResult.success) {
          throw new PrintJobAnalysisError(
            `Invalid print options for file ${index + 1}.`,
            400,
          );
        }

        return { id: fileId, options: optionsResult.data };
      });
    } catch (error) {
      if (error instanceof PrintJobAnalysisError) {
        return res.status(error.statusCode).json({ error: error.message });
      }

      return res.status(400).json({ error: "Invalid request payload." });
    }

    try {
      const job = await prisma.printJob.findUnique({
        where: { id: jobId },
        include: {
          files: {
            include: {
              option: true,
            },
          },
          owners: {
            select: {
              userId: true,
            },
          },
        },
      });

      if (!job) {
        return res.status(404).json({ error: "Job not found." });
      }

      if (job.status !== PrintJobStatus.DRAFT) {
        return res
          .status(403)
          .json({ error: "This job is not available for review." });
      }

      const isOwner = job.userId === userId;

      if (!isOwner) {
        return res
          .status(403)
          .json({ error: "You do not have access to this job." });
      }

      const jobFilesById = new Map(job.files.map((file) => [file.id, file]));
      const requestedIds = new Set(parsedFiles.map((file) => file.id));

      for (const fileId of requestedIds) {
        if (!jobFilesById.has(fileId)) {
          return res
            .status(400)
            .json({ error: "One or more files are invalid for this job." });
        }
      }

      const removedFiles = job.files.filter(
        (file) => !requestedIds.has(file.id),
      );
      const updateEntries = parsedFiles.map((file) => {
        const existing = jobFilesById.get(file.id)!;
        const optionId = existing.option?.id;

        if (!optionId) {
          throw new PrintJobAnalysisError(
            `${existing.name}: missing print options for this file.`,
            400,
          );
        }

        if (file.options.pageRange === "CUSTOM") {
          const rangeError = validateCustomPageRange(
            file.options.customRange ?? "",
            existing.pages,
          );
          if (rangeError) {
            throw new PrintJobAnalysisError(
              `${existing.name}: ${rangeError}`,
              400,
            );
          }
        }

        const cost = calculateFileCost(existing.pages, {
          paperSize: file.options.paperSize,
          colorMode: file.options.colorMode,
          orientation: file.options.orientation,
          scaleMode: file.options.scaleMode,
          pageRange: file.options.pageRange,
          customRange: file.options.customRange,
          duplex: file.options.duplex,
          copies: file.options.copies,
        });

        return {
          fileId: file.id,
          optionId,
          pages: existing.pages,
          cost,
          options: file.options,
        };
      });

      const totalPages = updateEntries.reduce(
        (sum, file) => sum + file.pages,
        0,
      );
      const totalCost = updateEntries.reduce((sum, file) => sum + file.cost, 0);

      const verificationCode =
        job.verificationCode ?? (await generateUniqueVerificationCode());

      await prisma.$transaction(async (tx) => {
        for (const entry of updateEntries) {
          await tx.printOption.update({
            where: { id: entry.optionId },
            data: {
              copies: entry.options.copies,
              colorMode: mapColorModeToEnum(entry.options.colorMode),
              orientation: mapOrientationToEnum(entry.options.orientation),
              scaleMode: mapScaleModeToEnum(entry.options.scaleMode),
              duplex: mapDuplexToEnum(entry.options.duplex),
              paperSize: entry.options.paperSize,
              pageRange: entry.options.pageRange,
              customRange: entry.options.customRange,
            },
          });
        }

        if (removedFiles.length) {
          const optionIds = removedFiles
            .map((file) => file.option?.id)
            .filter((id): id is string => !!id);

          await tx.file.deleteMany({
            where: { id: { in: removedFiles.map((file) => file.id) } },
          });

          if (optionIds.length) {
            await tx.printOption.deleteMany({
              where: { id: { in: optionIds } },
            });
          }
        }

        await tx.printJob.update({
          where: { id: jobId },
          data: {
            userId,
            totalPages,
            totalCost,
            estimatedTime: calculateEstimatedTime(totalPages),
            status: PrintJobStatus.PENDING,
            verificationCode,
          },
        });
      });

      await Promise.allSettled(
        removedFiles.map((file) => deleteObjectFromR2ByUrl(file.url)),
      );

      // --- NEW: Calculate Cost Breakdown for Owner's WhatsApp Message ---
      const perUserMap = new Map<
        string,
        { key: string; displayName: string; role: string; cost: number }
      >();

      for (const entry of updateEntries) {
        const f = job.files.find(f => f.id === entry.fileId);
        if (!f) continue;
        const key =
          f.uploadedByUserId ||
          f.uploadedByPhoneNumber ||
          f.uploadedByDisplayName ||
          "unknown";
        const displayName =
          f.uploadedByDisplayName || f.uploadedByPhoneNumber || "Unknown";
        const existing = perUserMap.get(key) ?? {
          key,
          displayName,
          role: f.uploadedByRole,
          cost: 0,
        };
        existing.cost += entry.cost;
        perUserMap.set(key, existing);
      }
      const perUserCosts = [...perUserMap.values()].sort((a, b) => b.cost - a.cost);
      
      // Notify owner via WhatsApp with OTP and Cost Breakdown
      if (userId) {
        const ownerWa = await prisma.whatsAppUser.findFirst({
          where: { userId },
          select: { phoneNumber: true },
        });
        if (ownerWa?.phoneNumber) {
          const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
          if (phoneNumberId) {
            const message = [
              `*Job Submitted Successfully!*`,
              ``,
              `Your Verification Code (OTP) is: *${verificationCode}*`,
              `Share this code with the shopkeeper to collect your prints.`,
              ``,
              `*Total:* Rs ${totalCost}`
            ].join("\n");
            
            try {
              const { sendWhatsAppTextMessage } = await import("../modules/whatsappServices.js");
              await sendWhatsAppTextMessage({
                to: ownerWa.phoneNumber,
                phoneNumberId,
                message,
              });
            } catch (err) {
              console.error("Failed to send OTP whatsapp message", err);
            }
          } else {
            console.error("Missing WHATSAPP_PHONE_NUMBER_ID in env, cannot send OTP message.");
          }
        }
      }

      const statusText = PrintJobStatus.PENDING;
      const msg = `Your print job with verification code ${verificationCode} is now ${statusText}.`;
      socket.emit("job-status-updated", userId, job.id, msg);
      socket.emit("job-created", "admin");

      return res.status(200).json({
        message: "Job updated successfully.",
        verificationCode,
      });
    } catch (error) {
      if (error instanceof PrintJobAnalysisError) {
        return res.status(error.statusCode).json({ error: error.message });
      }

      console.error("Error submitting whatsapp job review:", error);
      return res.status(500).json({ error: "Internal server error" });
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
              option: {
                select: {
                  id: true,
                },
              },
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

        const optionIds = existingJob.files
          .map((file) => file.option?.id)
          .filter((id): id is string => !!id);

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

      for (const file of existingJob.files) {
        await deleteObjectFromR2ByUrl(file.url);
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
