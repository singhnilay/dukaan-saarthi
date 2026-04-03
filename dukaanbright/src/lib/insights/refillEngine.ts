import type { DemandVelocity } from "./demandAnalysis";
import type { Priority } from "./priorityScoring";
import { scorePriority } from "./priorityScoring";

export type RefillSuggestion = {
  productId: string;
  reason: string;
  recommendedQty: number;
  priority: Priority;
  impactInr: number;
};

export type RefillInputs = {
  productId: string;
  productName: string;
  currentQty: number;
  minQty: number;
  sellingPrice: number;
  leadTimeDays?: number;
  moq?: number;
  velocity7d?: DemandVelocity;
  velocity30d?: DemandVelocity;
};

export function buildRefillSuggestion(input: RefillInputs): RefillSuggestion | null {
  const { currentQty, minQty, sellingPrice, productName } = input;
  const velocity = input.velocity7d?.unitsPerDay ?? input.velocity30d?.unitsPerDay ?? 0;
  const targetDays = 7;
  const targetQty = Math.ceil(velocity * targetDays) || minQty || 1;
  const refillQty = Math.max(targetQty - currentQty, input.moq ?? 0);
  const minRecommended = input.moq ?? 1;

  if (refillQty <= 0 && currentQty > minQty) return null;

  const stockoutHorizon = velocity === 0 ? Infinity : currentQty / velocity;
  const urgency = stockoutHorizon === Infinity ? 0.1 : Math.min(1, targetDays / Math.max(1, stockoutHorizon));
  const impactInr = refillQty * sellingPrice;
  const priority = scorePriority({ urgency, impactInr, confidence: 0.6 });

  return {
    productId: input.productId,
    reason: `${productName} will stockout in ${stockoutHorizon === Infinity ? "~" : Math.max(1, Math.round(stockoutHorizon))} days. Refill to cover ${targetDays} days.`,
    recommendedQty: Math.max(refillQty, minRecommended),
    priority,
    impactInr,
  };
}
