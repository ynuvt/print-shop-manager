/**
 * Shared domain types for the print job flow.
 * Used by pdfPageCount, costCalculator, jobBuilder, and the UI layer.
 */

export type PrintOptions = {
  paperSize: "A4"; // only A4 available currently
  colorMode: "bw" | "color";
  pageRange: "all" | "custom";
  customRange: string;
  duplex: "one" | "both";
  copies: number;
};

/** Constructs a fresh set of default print options. */
export const defaultPrintOptions = (): PrintOptions => ({
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
  options: PrintOptions;
  /** Empty string = no error. Non-empty = validation message for the custom page range. */
  pageRangeError: string;
};

/** A file that has been successfully uploaded to R2 and is ready to be submitted as part of a job. */
export type UploadedPrintFile = {
  name: string;
  pages: number;
  url: string;
  key: string;
  options: PrintOptions;
  cost: number;
};
