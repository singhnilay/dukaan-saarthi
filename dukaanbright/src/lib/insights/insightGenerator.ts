import { buildDiscountSuggestion, type DiscountInputs } from "./discountEngine";
import { buildPricingSuggestion, type PricingInputs } from "./pricingEngine";
import { buildRefillSuggestion, type RefillInputs } from "./refillEngine";
import type { Priority } from "./priorityScoring";

export type ProductSnapshot = {
  id: string;
  name: string;
  quantity: number;
  minQuantity: number;
  costPrice: number;
  sellingPrice: number;
  daysToExpiry?: number;
  demandTrend: "rising" | "stable" | "falling";
  overstock?: boolean;
};

export type GeneratedInsight = {
  productId: string;
  productName: string;
  type: "price_increase" | "price_decrease" | "restock" | "clearance" | "trending";
  recommendation: string;
  impact: string;
  currentPrice: number;
  suggestedPrice?: number;
  priority: Priority;
};

export type GeneratorContext = {
  expensePerUnit?: number;
  floorPricePct?: number;
  ceilingPricePct?: number;
};

export function generateInsights(products: ProductSnapshot[], ctx: GeneratorContext = {}): GeneratedInsight[] {
  const results: GeneratedInsight[] = [];

  for (const product of products) {
    // Refill
    const refill = buildRefillSuggestion({
      productId: product.id,
      productName: product.name,
      currentQty: product.quantity,
      minQty: product.minQuantity,
      sellingPrice: product.sellingPrice,
    } as RefillInputs);
    if (refill) {
      results.push({
        productId: product.id,
        productName: product.name,
        type: "restock",
        recommendation: refill.reason,
        impact: `Refill ~${refill.recommendedQty} units to avoid stockout; potential sales ${formatInr(refill.impactInr)}`,
        currentPrice: product.sellingPrice,
        priority: refill.priority,
      });
    }

    // Pricing
    const pricing = buildPricingSuggestion({
      productId: product.id,
      productName: product.name,
      currentPrice: product.sellingPrice,
      costPrice: product.costPrice,
      demandTrend: product.demandTrend,
    } as PricingInputs);
    if (pricing) {
      results.push({
        productId: product.id,
        productName: product.name,
        type: pricing.type,
        recommendation: pricing.reason,
        impact: `Expected impact ${formatInr(pricing.impactInr)}`,
        currentPrice: product.sellingPrice,
        suggestedPrice: pricing.suggestedPrice,
        priority: pricing.priority,
      });
    }

    // Discounts
    const discount = buildDiscountSuggestion({
      productId: product.id,
      productName: product.name,
      currentPrice: product.sellingPrice,
      costPrice: product.costPrice,
      overstock: Boolean(product.overstock),
      daysToExpiry: product.daysToExpiry,
      demandTrend: product.demandTrend,
    } as DiscountInputs);
    if (discount) {
      results.push({
        productId: product.id,
        productName: product.name,
        type: "clearance",
        recommendation: discount.reason,
        impact: `Try ${discount.suggestedDiscountPct}% off; projected unit impact ${formatInr(discount.impactInr)}`,
        currentPrice: product.sellingPrice,
        priority: discount.priority,
      });
    }

    // Trending high-demand callout
    if (product.demandTrend === "rising" && product.quantity > product.minQuantity) {
      results.push({
        productId: product.id,
        productName: product.name,
        type: "trending",
        recommendation: `${product.name} demand is surging. Keep visibility high and avoid stockouts.`,
        impact: "Protect availability to capture upside.",
        currentPrice: product.sellingPrice,
        priority: "medium",
      });
    }
  }

  return results;
}

function formatInr(value: number): string {
  return value.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
}
