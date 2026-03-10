/**
 * Assembles a fully typed Job payload from uploaded file data.
 *
 * Call this after all files have been uploaded to R2 and their metadata collected.
 * The resulting object can be directly passed to createPrintJob() in api/api.ts.
 */

import type { Job } from "@printowl/types";
import type { UploadedPrintFile } from "./types";

function generateVerificationCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

type BuildPrintJobParams = {
  userId: string;
  uploadedFiles: UploadedPrintFile[];
};

/**
 * Constructs a Job object conforming to the shared JobSchema.
 * Receives already-uploaded files (with R2 URLs and pre-computed costs).
 */
export function buildPrintJob({
  userId,
  uploadedFiles,
}: BuildPrintJobParams): Job {
  const totalPages = uploadedFiles.reduce((sum, f) => sum + f.pages, 0);
  const totalCost = uploadedFiles.reduce((sum, f) => sum + f.cost, 0);
  const estimatedTime = Math.ceil(totalPages * 0.2); // 0.2 min per page

  return {
    userId,
    files: uploadedFiles.map((f) => ({
      name: f.name,
      pages: f.pages,
      url: f.url,
      options: {
        paperSize: f.options.paperSize,
        colorMode: f.options.colorMode,
        pageRange: f.options.pageRange,
        // Only include customRange if the user actually set one
        customRange:
          f.options.pageRange === "custom" ? f.options.customRange : undefined,
        duplex: f.options.duplex,
        copies: f.options.copies,
      },
      cost: f.cost,
    })),
    totalCost,
    totalPages,
    estimatedTime,
    status: "processing",
    verificationCode: generateVerificationCode(),
    createdAt: new Date(),
    notified: false,
  };
}
