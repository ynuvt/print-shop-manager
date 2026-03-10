/**
 * Cost calculation helpers for the print job flow.
 *
 * Pricing (matches old frontend):
 *   B&W:   ₹2 per sheet
 *   Color: ₹7 per sheet
 *   Duplex prints 2 pages per sheet (rounds up for odd pages).
 */

import type { PrintFileState, PrintOptions } from "./types";

const PRICE_BW = 2;
const PRICE_COLOR = 7;

/**
 * Parses a custom page range string (e.g. "1-5, 8, 10-12") into a total page count.
 * Invalid or empty segments are ignored.
 */
export function parseCustomPageRange(range: string): number {
  if (!range.trim()) return 0;

  let count = 0;

  for (const part of range.split(",")) {
    const segment = part.trim();

    if (segment.includes("-")) {
      const dashIndex = segment.indexOf("-");
      const start = parseInt(segment.slice(0, dashIndex));
      const end = parseInt(segment.slice(dashIndex + 1));
      if (!isNaN(start) && !isNaN(end) && end >= start) {
        count += end - start + 1;
      }
    } else {
      const page = parseInt(segment);
      if (!isNaN(page)) count += 1;
    }
  }

  return count;
}

/**
 * Validates a custom page range string against the file's total page count.
 * Returns an error message string, or null if the range is valid.
 */
export function validateCustomPageRange(
  range: string,
  totalPages: number,
): string | null {
  if (!range.trim()) return "Enter a page range (e.g. 1-5, 8, 10-12)";

  for (const part of range.split(",")) {
    const segment = part.trim();

    if (segment.includes("-")) {
      const dashIndex = segment.indexOf("-");
      const start = parseInt(segment.slice(0, dashIndex));
      const end = parseInt(segment.slice(dashIndex + 1));

      if (isNaN(start) || isNaN(end)) return "Invalid range format";
      if (start < 1) return "Page numbers must start from 1";
      if (end > totalPages)
        return `Page ${end} exceeds total pages (${totalPages})`;
      if (start > end)
        return "Start page must be less than or equal to end page";
    } else {
      const page = parseInt(segment);
      if (isNaN(page)) return "Invalid page number";
      if (page < 1) return "Page numbers must start from 1";
      if (page > totalPages)
        return `Page ${page} exceeds total pages (${totalPages})`;
    }
  }

  return null;
}

/**
 * Computes the cost in ₹ for a single file based on its detected page count and options.
 * Respects custom page ranges, duplex, copies, and color mode.
 */
export function calculateFileCost(
  detectedPages: number,
  options: PrintOptions,
): number {
  const pricePerSheet = options.colorMode === "color" ? PRICE_COLOR : PRICE_BW;

  const effectivePages =
    options.pageRange === "custom" && options.customRange
      ? parseCustomPageRange(options.customRange)
      : detectedPages;

  const sheets =
    options.duplex === "both" ? Math.ceil(effectivePages / 2) : effectivePages;

  return sheets * pricePerSheet * options.copies;
}

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
  const estimatedTime = Math.ceil(totalPages * 0.2); // 0.2 min per page

  return { totalCost, totalPages, estimatedTime };
}
