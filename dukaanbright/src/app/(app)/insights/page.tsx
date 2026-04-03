"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveUserShop } from "@/lib/supabase/shopResolver";
import { formatCurrency, formatNumber, getPriorityColor, getInsightIcon, isSafeModeEnabled } from "@/lib/utils";
import { AIInsight } from "@/types";

const typeFilters = ["All", "price_increase", "price_decrease", "restock", "clearance", "trending"];
const typeLabels: Record<string, string> = {
  All: "All",
  price_increase: "Price Up",
  price_decrease: "Price Down",
  restock: "Restock",
  clearance: "Clearance",
  trending: "Trending",
};

type Spotlight = {
  title: string;
  value: string;
  badge: string;
  tone: "emerald" | "amber" | "red" | "blue";
  description: string;
};

export default function InsightsPage() {
  const devBypassAuth = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "1";
  const [activeFilter, setActiveFilter] = useState("All");
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [safeMode, setSafeMode] = useState(false);

  useEffect(() => {
    setSafeMode(isSafeModeEnabled());
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        if (safeMode) {
          setLoading(false);
          return;
        }

        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        const user = userData.user;

        if (!user && !devBypassAuth) {
          setError("Please sign in to view AI insights.");
          setLoading(false);
          return;
        }

        const shop = user
          ? ((await resolveUserShop(supabase, user.id, "id")) as { id: string } | null)
          : (await supabase
              .from("shops")
              .select("id")
              .order("created_at", { ascending: true })
              .maybeSingle()).data;

        if (!shop) {
          setError("Finish onboarding your shop to unlock insights.");
          setLoading(false);
          return;
        }

        const { data: rows, error: insightsError } = await supabase
          .from("ai_price_suggestions")
          .select("id, product_id, type, reason, impact_text, current_price, suggested_price, priority, product:products(name)")
          .eq("shop_id", shop.id)
          .order("created_at", { ascending: false })
          .limit(40);

        if (insightsError) {
          throw insightsError;
        }

        const mapped: AIInsight[] = (rows ?? []).map((i: any) => ({
          id: String(i.id),
          productId: String(i.product_id),
          productName: i.product?.name ?? "Product",
          type: (i.type as AIInsight["type"]) ?? "trending",
          recommendation: i.reason ?? "No recommendation available",
          impact: i.impact_text ?? "No impact estimate",
          currentPrice: Number(i.current_price ?? 0),
          suggestedPrice: i.suggested_price == null ? undefined : Number(i.suggested_price),
          priority: (i.priority as AIInsight["priority"]) ?? "medium",
        }));

        setInsights(mapped);
      } catch (err: any) {
        console.error("Failed to load insights:", err);
        setError("We couldn’t load AI insights. Please retry.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [safeMode]);

  const filtered = useMemo(() => {
    if (activeFilter === "All") return insights;
    return insights.filter((i) => i.type === activeFilter);
  }, [activeFilter, insights]);

  const summary = useMemo(() => {
    const highCount = insights.filter((i) => i.priority === "high").length;
    const potentialGain = insights.reduce((sum, i) => {
      if (i.suggestedPrice == null) return sum;
      const delta = i.suggestedPrice - i.currentPrice;
      return sum + delta;
    }, 0);
    const pending = insights.length - appliedIds.size;
    return { highCount, potentialGain, pending };
  }, [insights, appliedIds]);

  const spotlight: Spotlight | null = useMemo(() => {
    if (!insights.length) return null;
    const highImpact = insights.filter((i) => i.priority === "high");
    const pool = highImpact.length ? highImpact : insights;
    const pick = pool[0];
    if (!pick) return null;
    const delta = pick.suggestedPrice ? pick.suggestedPrice - pick.currentPrice : 0;
    const tone: Spotlight["tone"] = pick.priority === "high" ? "red" : pick.priority === "medium" ? "amber" : "emerald";
    return {
      title: `${pick.productName}: ${typeLabels[pick.type] ?? "Insight"}`,
      value: pick.suggestedPrice ? `${delta >= 0 ? "+" : ""}${formatCurrency(delta)}` : pick.recommendation,
      badge: `${pick.priority.toUpperCase()} PRIORITY`,
      tone,
      description: pick.recommendation,
    };
  }, [insights]);

  const handleApply = async (id: string) => {
    try {
      setApplyingId(id);
      const supabase = createClient();
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;

      const res = await fetch("/api/insights/actions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ insightId: id, action: "apply" }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Failed to record action");
      }

      setAppliedIds((prev) => new Set([...prev, id]));
    } catch (err: any) {
      console.error("Failed to apply insight", err);
      setError(err?.message ?? "Failed to apply insight");
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* Hero / Spotlight */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0f766e] via-[#0b8c7a] to-[#0f172a] text-white shadow-card p-6 md:p-8">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_20%_20%,#6ee7b7,transparent_25%),radial-gradient(circle_at_80%_0%,#22d3ee,transparent_20%),radial-gradient(circle_at_50%_80%,#a5b4fc,transparent_30%)]" />
        <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-extrabold uppercase tracking-[0.25em] text-white/70">AI Insights</p>
            <h1 className="text-3xl md:text-4xl font-extrabold leading-tight">Your shop’s next best moves</h1>
            <p className="text-sm md:text-base text-white/80 max-w-2xl">
              Live recommendations grounded in your sales and stock. Apply, adjust, and stay ahead of stockouts and margin leaks.
            </p>
          </div>
          {spotlight && (
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 w-full md:w-[360px] shadow-card">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full tracking-wider ${
                  spotlight.tone === "red" ? "bg-red-100/20 text-red-50" : spotlight.tone === "amber" ? "bg-amber-100/20 text-amber-50" : "bg-emerald-100/20 text-emerald-50"
                }`}>
                  {spotlight.badge}
                </span>
                <span className="material-symbols-outlined text-white/80 text-[18px]">bolt</span>
              </div>
              <p className="text-lg font-extrabold leading-tight">{spotlight.title}</p>
              <p className="text-2xl font-extrabold mt-1">{spotlight.value}</p>
              <p className="text-sm text-white/80 mt-1">{spotlight.description}</p>
            </div>
          )}
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[{
          label: "High Priority",
          value: formatNumber(summary.highCount),
          color: "text-red-600",
          bg: "bg-red-50",
          icon: "priority_high",
        }, {
          label: "Potential Gain",
          value: summary.potentialGain === 0 ? "—" : formatCurrency(summary.potentialGain),
          color: "text-emerald-600",
          bg: "bg-emerald-50",
          icon: "trending_up",
        }, {
          label: "Actions Pending",
          value: formatNumber(summary.pending),
          color: "text-amber-600",
          bg: "bg-amber-50",
          icon: "pending_actions",
        }].map((s) => (
          <div key={s.label} className="bg-surface-container-lowest rounded-xl p-5 shadow-card flex items-center gap-4">
            <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center`}>
              <span className={`material-symbols-outlined ${s.color} text-[20px]`}>{s.icon}</span>
            </div>
            <div>
              <p className="text-2xl font-extrabold text-on-surface tracking-tight">{s.value}</p>
              <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wide">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 flex-wrap">
        {typeFilters.map((f) => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            className={`px-4 py-2 rounded-full text-xs font-extrabold uppercase tracking-wide transition-all ${
              activeFilter === f
                ? "cta-gradient text-white shadow-card"
                : "bg-surface-container-lowest text-on-surface-variant border border-outline-variant hover:bg-surface-container-low"
            }`}
          >
            {typeLabels[f]}
          </button>
        ))}
      </div>

      {/* Insight cards or empty state */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5" role="status">
          {[...Array(4)].map((_, idx) => (
            <div key={idx} className="bg-surface-container-lowest rounded-xl p-6 shadow-card animate-pulse space-y-4">
              <div className="h-4 w-32 bg-surface-container" />
              <div className="h-6 w-48 bg-surface-container" />
              <div className="h-4 w-full bg-surface-container" />
              <div className="h-10 w-full bg-surface-container" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm font-medium text-red-800">
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline/40 bg-surface-container-low p-8 text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-surface-container flex items-center justify-center">
            <span className="material-symbols-outlined text-[28px] text-primary-container">sparkles</span>
          </div>
          <p className="text-lg font-extrabold text-on-surface">No AI tips yet</p>
          <p className="text-sm font-medium text-on-surface-variant max-w-xl mx-auto">
            Add a few sales and products, then refresh. We’ll analyze demand, margin, expiry, and pricing to surface your next best moves.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {filtered.map((insight: AIInsight) => {
            const applied = appliedIds.has(insight.id);
            const delta = insight.suggestedPrice ? insight.suggestedPrice - insight.currentPrice : null;
            const deltaTone = delta == null ? "" : delta >= 0 ? "text-emerald-600" : "text-red-600";
            return (
              <div
                key={insight.id}
                className={`bg-surface-container-lowest rounded-xl p-6 shadow-card hover:shadow-card-hover transition-all duration-200 border border-outline/20 ${applied ? "opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      insight.priority === "high" ? "bg-red-50" : insight.priority === "medium" ? "bg-amber-50" : "bg-emerald-50"
                    }`}>
                      <span className={`material-symbols-outlined text-[20px] ${
                        insight.priority === "high" ? "text-red-500" : insight.priority === "medium" ? "text-amber-500" : "text-emerald-500"
                      }`}>{getInsightIcon(insight.type)}</span>
                    </div>
                    <div>
                      <p className="text-sm font-extrabold text-on-surface">{insight.productName}</p>
                      <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wide border ${getPriorityColor(insight.priority)}`}>
                        {insight.priority} priority
                      </span>
                    </div>
                  </div>
                  {applied && (
                    <span className="text-[10px] font-extrabold px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 uppercase tracking-wide">
                      ✓ Applied
                    </span>
                  )}
                </div>

                <p className="text-base font-extrabold text-on-surface mb-1">{insight.recommendation}</p>
                <p className="text-sm font-medium text-on-surface-variant mb-4">{insight.impact}</p>

                {insight.suggestedPrice != null && (
                  <div className="flex items-center gap-4 mb-5 p-3 bg-surface-container-low rounded-xl border border-outline/20">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">Current Price</p>
                      <p className="text-lg font-extrabold text-on-surface">{formatCurrency(insight.currentPrice)}</p>
                    </div>
                    <span className="material-symbols-outlined text-on-surface-variant text-[20px]">arrow_forward</span>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">Suggested</p>
                      <p className={`text-lg font-extrabold ${deltaTone}`}>
                        {formatCurrency(insight.suggestedPrice)}
                      </p>
                    </div>
                    <div className={`ml-auto px-3 py-1.5 rounded-full text-xs font-extrabold ${
                      delta != null && delta >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                    }`}>
                      {delta != null && delta >= 0 ? "+" : ""}
                      {delta != null ? formatCurrency(delta) : ""}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleApply(insight.id)}
                    disabled={applied || applyingId === insight.id}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.98] ${
                      applied || applyingId === insight.id
                        ? "bg-surface-container text-on-surface-variant cursor-default"
                        : "cta-gradient text-white hover:opacity-90 shadow-card"
                    }`}
                  >
                    {applied ? "Applied ✓" : applyingId === insight.id ? "Applying..." : "Apply Suggestion"}
                  </button>
                  <button
                    disabled
                    className="px-4 py-2 rounded-xl text-xs font-bold text-on-surface-variant border border-outline/30 bg-surface-container-low"
                  >
                    Coming soon: explain
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
