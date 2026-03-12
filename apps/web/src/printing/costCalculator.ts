import {
  calculateEstimatedTime,
  calculateFileCost,
  parseCustomPageRange,
  validateCustomPageRange,
} from "@printowl/shared-utils";
import type { PrintFileState } from "./types";

export { calculateFileCost, parseCustomPageRange, validateCustomPageRange };

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
