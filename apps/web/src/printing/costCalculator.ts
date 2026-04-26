/**
 * Re-export shared calculation utilities from @printowl/shared-utils.
 * All cost calculation, page range parsing, and job totals logic lives in the shared package.
 */

export {
  calculateFileCost,
  parseCustomPageRange,
  validateCustomPageRange,
  buildJobTotals,
} from "@printowl/shared-utils";
