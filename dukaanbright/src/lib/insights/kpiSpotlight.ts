import { scorePriority, type Priority } from "./priorityScoring";

export type KpiCandidate = {
  code: "stockout_prevented" | "net_profit_lift" | "expiry_loss_avoided" | "discount_roi";
  value: number;
  context: string;
  weight?: number;
};

export type SpotlightPick = {
  code: KpiCandidate["code"];
  label: string;
  valueText: string;
  tone: "red" | "amber" | "emerald" | "blue";
};

export type SpotlightMemory = {
  lastCode?: KpiCandidate["code"];
};

const LABELS: Record<KpiCandidate["code"], string> = {
  stockout_prevented: "Stockout Risk Prevented",
  net_profit_lift: "Projected Net Profit Lift",
  expiry_loss_avoided: "Expiry Loss Avoided",
  discount_roi: "Discount Campaign ROI Potential",
};

export function pickSpotlight(candidates: KpiCandidate[], memory: SpotlightMemory = {}): SpotlightPick | null {
  if (!candidates.length) return null;

  const filtered = candidates.filter((c) => c.value > 0);
  if (!filtered.length) return null;

  const weighted = filtered.map((c) => ({
    ...c,
    weight: c.weight ?? defaultWeight(c.code),
  }));

  const pool = weighted.flatMap((c) => Array(Math.max(1, Math.round(c.weight! * 10))).fill(c));
  const pick = avoidRepeat(pool, memory.lastCode);
  if (!pick) return null;

  const tone: SpotlightPick["tone"] = pick.code === "stockout_prevented" ? "red"
    : pick.code === "net_profit_lift" ? "emerald"
    : pick.code === "expiry_loss_avoided" ? "amber"
    : "blue";

  return {
    code: pick.code,
    label: LABELS[pick.code],
    valueText: pick.value.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }),
    tone,
  };
}

function defaultWeight(code: KpiCandidate["code"]): number {
  switch (code) {
    case "stockout_prevented": return 1.4;
    case "net_profit_lift": return 1.1;
    case "expiry_loss_avoided": return 1.0;
    case "discount_roi": return 0.9;
    default: return 1;
  }
}

function avoidRepeat(pool: KpiCandidate[], lastCode?: KpiCandidate["code"]): KpiCandidate | null {
  if (!pool.length) return null;
  const filtered = lastCode ? pool.filter((c) => c.code !== lastCode) : pool;
  const usable = filtered.length ? filtered : pool;
  const idx = Math.floor(Math.random() * usable.length);
  return usable[idx];
}

export function computePriorityFromKpi(value: number): Priority {
  const impactInr = Math.abs(value);
  const urgency = impactInr > 20000 ? 0.8 : impactInr > 8000 ? 0.5 : 0.3;
  return scorePriority({ urgency, impactInr, confidence: 0.6 });
}
