export type ProfitInputs = {
  sellingPrice: number;
  costPrice: number;
  expensePerUnit?: number;
};

export type ProfitMetrics = {
  grossMarginPct: number;
  netMarginPct: number;
  grossPerUnit: number;
  netPerUnit: number;
};

export function computeProfit({ sellingPrice, costPrice, expensePerUnit = 0 }: ProfitInputs): ProfitMetrics {
  const grossPerUnit = sellingPrice - costPrice;
  const netPerUnit = sellingPrice - costPrice - expensePerUnit;
  const grossMarginPct = sellingPrice === 0 ? 0 : (grossPerUnit / sellingPrice) * 100;
  const netMarginPct = sellingPrice === 0 ? 0 : (netPerUnit / sellingPrice) * 100;
  return {
    grossMarginPct: Number(grossMarginPct.toFixed(2)),
    netMarginPct: Number(netMarginPct.toFixed(2)),
    grossPerUnit: Number(grossPerUnit.toFixed(2)),
    netPerUnit: Number(netPerUnit.toFixed(2)),
  };
}
