import type { File, Job } from "@printowl/types";
import {
  calculateEstimatedTime,
  calculateFileCost,
  validateCustomPageRange,
} from "@printowl/shared-utils";
import { getPdfPageCountFromBuffer } from "./pdfPageCount.js";

export class PrintJobAnalysisError extends Error {
  constructor(
    message: string,
    readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = "PrintJobAnalysisError";
  }
}

type AnalyzedPrintFile = Omit<File, "pages" | "cost"> & {
  pages: number;
  cost: number;
};

async function fetchFileBuffer(url: string, fileName: string): Promise<Buffer> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new PrintJobAnalysisError(
      `Unable to fetch ${fileName} from storage. Please re-upload and try again.`,
      502,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function analyzeUploadedPrintFile(
  file: Job["files"][number],
): Promise<AnalyzedPrintFile> {
  const fileBuffer = await fetchFileBuffer(file.url, file.name);

  let pages: number;

  try {
    pages = await getPdfPageCountFromBuffer(fileBuffer);
  } catch {
    throw new PrintJobAnalysisError(
      `Unable to inspect ${file.name}. Only valid PDF files can be submitted.`,
      400,
    );
  }

  if (file.option.pageRange === "CUSTOM") {
    const rangeError = validateCustomPageRange(
      file.option.customRange ?? "",
      pages,
    );

    if (rangeError) {
      throw new PrintJobAnalysisError(`${file.name}: ${rangeError}`, 400);
    }
  }

  const cost = calculateFileCost(pages, {
    paperSize: file.option.paperSize,
    colorMode: file.option.colorMode,
    orientation: file.option.orientation,
    scaleMode: file.option.scaleMode,
    pageRange: file.option.pageRange,
    customRange: file.option.customRange,
    duplex: file.option.duplex,
    copies: file.option.copies,
  });

  return {
    ...file,
    pages,
    cost,
  };
}

export async function analyzePrintJob(job: Job): Promise<{
  files: AnalyzedPrintFile[];
  totalPages: number;
  totalCost: number;
  estimatedTime: number;
}> {
  const files = await Promise.all(job.files.map(analyzeUploadedPrintFile));
  const totalPages = files.reduce((sum, file) => sum + file.pages, 0);
  const totalCost = files.reduce((sum, file) => sum + file.cost, 0);

  return {
    files,
    totalPages,
    totalCost,
    estimatedTime: calculateEstimatedTime(totalPages),
  };
}
