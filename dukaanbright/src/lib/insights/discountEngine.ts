import type { Priority } from "./priorityScoring";
import { scorePriority } from "./priorityScoring";

export type DiscountSuggestion = {
  productId: string;
  suggestedDiscountPct: number;
  reason: string;
  priority: Priority;
  impactInr: number;
};

export type DiscountInputs = {
  productId: string;
  productName: string;
  currentPrice: number;
  costPrice: number;
  overstock: boolean;
  daysToExpiry?: number;
  demandTrend: "rising" | "stable" | "falling";
};

export function buildDiscountSuggestion(input: DiscountInputs): DiscountSuggestion | null {
  const { overstock, daysToExpiry, demandTrend, currentPrice, costPrice, productName } = input;
  const nearExpiry = (daysToExpiry ?? 999) <= 14;
  const safeFloor = costPrice * 1.05;
  const maxDiscountPct = Math.min(25, Math.max(5, Math.floor(((currentPrice - safeFloor) / currentPrice) * 100)));

  if (!(overstock || nearExpiry) || demandTrend === "rising") return null;

  const suggestedDiscountPct = Math.min(15, Math.max(5, maxDiscountPct));
  const impactInr = -(suggestedDiscountPct / 100) * currentPrice;
  const urgency = nearExpiry ? 0.8 : 0.5;
  const priority = scorePriority({ urgency, impactInr: Math.abs(impactInr), confidence: 0.5 });

  return {
    productId: input.productId,
    suggestedDiscountPct,
    reason: nearExpiry
      ? `${productName} is near expiry; run a short clearance.`
      : `${productName} is overstocked; discount to free up cash.`,
    priority,
    impactInr,
  };
}
