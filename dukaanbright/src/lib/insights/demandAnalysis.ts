export type DemandWindow = "7d" | "30d";

export type SalesRecord = {
  productId: string;
  quantity: number;
  ts: string; // ISO string
};

export type DemandVelocity = {
  productId: string;
  window: DemandWindow;
  unitsPerDay: number;
};

export function computeVelocity(records: SalesRecord[], window: DemandWindow): DemandVelocity[] {
  const windowDays = window === "7d" ? 7 : 30;
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const grouped = new Map<string, number>();

  for (const r of records) {
    const ts = Date.parse(r.ts);
    if (Number.isNaN(ts) || ts < cutoff) continue;
    grouped.set(r.productId, (grouped.get(r.productId) ?? 0) + r.quantity);
  }

  return Array.from(grouped.entries()).map(([productId, qty]) => ({
    productId,
    window,
    unitsPerDay: Number((qty / windowDays).toFixed(2)),
  }));
}

export function classifyTrend(v7: number, v30: number): "rising" | "stable" | "falling" {
  const delta = v7 - v30;
  const pct = v30 === 0 ? (v7 > 0 ? 1 : 0) : delta / v30;
  if (pct > 0.25) return "rising";
  if (pct < -0.25) return "falling";
  return "stable";
}
