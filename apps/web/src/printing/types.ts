/**
 * Shared domain types for the print job flow.
 * Used by pdfPageCount, costCalculator, and the UI layer.
 */

import type { PrintFileOption } from "@printowl/types";
/** Constructs a fresh set of default print options. */
export const defaultPrintOptions = (): PrintFileOption => ({
  paperSize: "A4",
  colorMode: "BW",
  pageRange: "ALL",
  customRange: "",
  duplex: "ONE",
  copies: 1,
});

/** A file the user has selected, with its detected page count and chosen print options. */
export type PrintFileState = {
  file: File;
  name: string;
  detectedPages: number;
  options: PrintFileOption;
  /** Empty string = no error. Non-empty = validation message for the custom page range. */
  pageRangeError: string;
};
