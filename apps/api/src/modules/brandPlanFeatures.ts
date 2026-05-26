// modules/brandPlanFeatures.ts
// Plan-based feature gating for brand dashboard capabilities.

import { BrandPlan } from "../../../../packages/db/dist/generated/prisma/enums.js";

const PLAN_FEATURES: Record<string, string[]> = {
  STANDARD: [
    "website_ads",
    "coupon_placement",
    "dashboard_analytics",
  ],
  PRO: [
    "website_ads",
    "coupon_placement",
    "dashboard_analytics",
    "whatsapp_coupon_texts",
    "whatsapp_template_coupons",
    "targeted_ads",
  ],
  PRO_PLUS: [
    "website_ads",
    "coupon_placement",
    "dashboard_analytics",
    "whatsapp_template_coupons",
    "whatsapp_reminders",
    "targeted_ads",
    "custom_whatsapp_campaigns",
    "priority_visibility",
  ],
};

/**
 * Check if a brand's plan includes a specific feature.
 */
export function brandHasFeature(plan: BrandPlan, feature: string): boolean {
  return PLAN_FEATURES[plan]?.includes(feature) ?? false;
}
