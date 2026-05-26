// modules/couponRules.ts
// Extensible rule engine for automatic coupon distribution.
// Add new rules to the `rules` array below.

type RuleContext = {
  userId: string;
  printJobId: string;
  totalCost: number;
};

type RuleResult = {
  eligible: boolean;
  reason?: string;
};

type CouponRule = {
  name: string;
  description: string;
  evaluate: (ctx: RuleContext) => Promise<RuleResult>;
};

// ─── RULE REGISTRY ──────────────────────────────────────────────────────────────
// Add new rules here. The first matching rule wins.
const rules: CouponRule[] = [
  {
    name: "min_total_cost",
    description: "Assign coupon when print job total cost > ₹60",
    evaluate: async (ctx) => {
      if (ctx.totalCost > 60) {
        return { eligible: true };
      }
      return { eligible: false, reason: "Cost below ₹60" };
    },
  },
  // ─── FUTURE RULES (examples) ───
  // { name: "frequent_user",  description: "5+ jobs in 30 days",      evaluate: ... },
  // { name: "first_job",      description: "Welcome coupon on first print", evaluate: ... },
  // { name: "high_spender",   description: "Lifetime spend > ₹500",   evaluate: ... },
];

/**
 * Evaluate all rules against the given context.
 * Returns the first matching rule's result.
 */
export async function evaluateRules(
  ctx: RuleContext,
): Promise<RuleResult & { ruleName?: string }> {
  for (const rule of rules) {
    const result = await rule.evaluate(ctx);
    if (result.eligible) {
      return { ...result, ruleName: rule.name };
    }
  }
  return { eligible: false };
}
