export type PrintOptions = {
  paperSize: "A4";
  colorMode: "BW" | "COLOR";
  orientation: "PORTRAIT" | "LANDSCAPE";
  scaleMode: "FIT" | "SHRINK" | "NOSCALE";
  pageRange: "ALL" | "CUSTOM";
  customRange?: string | null;
  duplex: "ONE" | "BOTH";
  copies: number;
  pagesPerSheet: number;
};

const PRICE_BW = 2;
const PRICE_COLOR = 7;
const MINUTES_PER_PAGE = 0.2;

export function parseCustomPageRange(range: string): number {
  if (!range.trim()) return 0;

  let count = 0;

  for (const part of range.split(",")) {
    const segment = part.trim();

    if (!segment) {
      continue;
    }

    if (segment.includes("-")) {
      const dashIndex = segment.indexOf("-");
      const start = parseInt(segment.slice(0, dashIndex), 10);
      const end = parseInt(segment.slice(dashIndex + 1), 10);

      if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start) {
        count += end - start + 1;
      }
    } else {
      const page = parseInt(segment, 10);

      if (!Number.isNaN(page)) {
        count += 1;
      }
    }
  }

  return count;
}

export function validateCustomPageRange(
  range: string,
  totalPages: number,
): string | null {
  if (!range.trim()) return "Enter a page range (e.g. 1-5, 8, 10-12)";

  for (const part of range.split(",")) {
    const segment = part.trim();

    if (!segment) {
      return "Invalid range format";
    }

    if (segment.includes("-")) {
      const dashIndex = segment.indexOf("-");
      const start = parseInt(segment.slice(0, dashIndex), 10);
      const end = parseInt(segment.slice(dashIndex + 1), 10);

      if (Number.isNaN(start) || Number.isNaN(end)) {
        return "Invalid range format";
      }

      if (start < 1) return "Page numbers must start from 1";
      if (end > totalPages) {
        return `Page ${end} exceeds total pages (${totalPages})`;
      }
      if (start > end) {
        return "Start page must be less than or equal to end page";
      }
    } else {
      const page = parseInt(segment, 10);

      if (Number.isNaN(page)) return "Invalid page number";
      if (page < 1) return "Page numbers must start from 1";
      if (page > totalPages) {
        return `Page ${page} exceeds total pages (${totalPages})`;
      }
    }
  }

  return null;
}

export function getSelectedPageCount(
  totalPages: number,
  options: PrintOptions,
): number {
  if (options.pageRange === "CUSTOM") {
    return parseCustomPageRange(options.customRange ?? "");
  }

  return totalPages;
}

export function calculateSheetCount(
  totalPages: number,
  options: PrintOptions,
): number {
  const selectedPages = getSelectedPageCount(totalPages, options);
  const pagesPerSheet = options.pagesPerSheet || 1;
  const layoutPages = Math.ceil(selectedPages / pagesPerSheet);
  
  return options.duplex === "BOTH" && options.colorMode != "COLOR"
    ? Math.ceil(layoutPages / 2)
    : layoutPages;
}

export function calculateFileCost(
  totalPages: number,
  options: PrintOptions,
): number {
  const pricePerSheet = options.colorMode === "COLOR" ? PRICE_COLOR : PRICE_BW;
  const sheets = calculateSheetCount(totalPages, options);

  return sheets * pricePerSheet * options.copies;
}

export function calculateEstimatedTime(totalPages: number): number {
  return Math.ceil(totalPages * MINUTES_PER_PAGE);
}

// ── Shared domain types used by both web and mobile ──

/** Constructs a fresh set of default print options. */
export const defaultPrintOptions = (): PrintOptions => ({
  paperSize: "A4",
  colorMode: "BW",
  orientation: "PORTRAIT",
  scaleMode: "FIT",
  pageRange: "ALL",
  customRange: "",
  duplex: "ONE",
  copies: 1,
  pagesPerSheet: 1,
});

/** A file the user has selected, with its detected page count and chosen print options. */
export type PrintFileState = {
  id?: string;
  url?: string;
  /** Platform-specific file handle (browser File, RN DocumentPickerAsset, etc.) */
  file?: unknown;
  name: string;
  detectedPages: number;
  options: PrintOptions;
  /** Empty string = no error. Non-empty = validation message for the custom page range. */
  pageRangeError: string;
};

/**
 * Aggregates totals across all selected files.
 * Returns totalCost, totalPages, and estimatedTime (in minutes) for the job summary.
 */
export function buildJobTotals(files: PrintFileState[]): {
  totalCost: number;
  totalPages: number;
  estimatedTime: number;
} {
  const totalPages = files.reduce((sum, f) => sum + f.detectedPages, 0);
  const totalCost = files.reduce(
    (sum, f) => sum + calculateFileCost(f.detectedPages, f.options),
    0,
  );
  const estimatedTime = calculateEstimatedTime(totalPages);

  return { totalCost, totalPages, estimatedTime };
}
