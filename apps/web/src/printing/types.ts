/**
 * Shared domain types for the print job flow.
 * Used by pdfPageCount, costCalculator, jobBuilder, and the UI layer.
 */

import type { PrintFileOption } from "@printowl/types";
/** Constructs a fresh set of default print options. */
export const defaultPrintOptions = (): PrintFileOption => ({
  paperSize: "A4",
  colorMode: "bw",
  pageRange: "all",
  customRange: "",
  duplex: "one",
  copies: 1,
});

/** A file the user has selected, with its detected page count and chosen print options. */
export type PrintFileState = {
  file: File;
  name: string;
  detectedPages: number;
  options: PrintFileOption ;
  /** Empty string = no error. Non-empty = validation message for the custom page range. */
  pageRangeError: string;
};

/** A file that has been successfully uploaded to R2 and is ready to be submitted as part of a job. */
export type UploadedPrintFile = {
  name: string;
  pages: number;
  url: string;
  key: string;
  options: PrintFileOption;
  cost: number;
};
