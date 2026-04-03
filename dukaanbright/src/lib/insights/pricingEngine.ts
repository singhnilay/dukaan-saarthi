import { scorePriority, type Priority } from "./priorityScoring";

export type PricingSuggestion = {
  productId: string;
  type: "price_increase" | "price_decrease";
  suggestedPrice: number;
  reason: string;
  priority: Priority;
  impactInr: number;
};

export type PricingInputs = {
  productId: string;
  productName: string;
  currentPrice: number;
  costPrice: number;
  demandTrend: "rising" | "stable" | "falling";
  floor?: number;
  ceiling?: number;
};

export function buildPricingSuggestion(input: PricingInputs): PricingSuggestion | null {
  const { currentPrice, costPrice, demandTrend, floor, ceiling, productName } = input;
  const margin = currentPrice - costPrice;
  const floorPrice = floor ?? Math.max(costPrice * 1.05, currentPrice * 0.9);
  const ceilingPrice = ceiling ?? currentPrice * 1.15;

  if (demandTrend === "rising" && currentPrice < ceilingPrice) {
    const suggestedPrice = Number(Math.min(ceilingPrice, currentPrice * 1.08).toFixed(2));
    const impactInr = suggestedPrice - currentPrice;
    const priority = scorePriority({ urgency: 0.45, impactInr, confidence: 0.55 });
    return {
      productId: input.productId,
      type: "price_increase",
      suggestedPrice,
      reason: `${productName} demand is rising; adjust price carefully to protect margin.`,
      priority,
      impactInr,
    };
  }

  if (demandTrend === "falling" && margin > 0 && currentPrice > floorPrice) {
    const suggestedPrice = Number(Math.max(floorPrice, currentPrice * 0.95).toFixed(2));
    const impactInr = suggestedPrice - currentPrice;
    const priority = scorePriority({ urgency: 0.35, impactInr: Math.abs(impactInr), confidence: 0.45 });
    return {
      productId: input.productId,
      type: "price_decrease",
      suggestedPrice,
      reason: `${productName} demand is softening; consider a small discount to move inventory.`,
      priority,
      impactInr,
    };
  }

  return null;
}
