"use client";
import { useEffect, useMemo, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { AIInsight, ChartDataPoint, DashboardStats, Product } from "@/types";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [shopName, setShopName] = useState("Your Shop");
  const [stats, setStats] = useState<DashboardStats>({
    todayProfit: 0,
    todayRevenue: 0,
    monthlyGoal: 0,
    monthlyProgress: 0,
    totalProducts: 0,
    lowStockCount: 0,
    expiringCount: 0,
    topProduct: "N/A",
  });
  const [products, setProducts] = useState<Product[]>([]);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [insights, setInsights] = useState<AIInsight[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const supabase = createClient();

        const { data: userData } = await supabase.auth.getUser();
        const user = userData.user;
        if (!user) {
          return;
        }

        const { data: shop } = await supabase
          .from("shops")
          .select("id, name")
          .eq("owner_user_id", user.id)
          .order("created_at", { ascending: true })
          .maybeSingle();

        if (!shop) {
          return;
        }

        setShopName(shop.name ?? "Your Shop");

        // Load monthly goal (if available).
        let monthlyGoal = 0;
        try {
          const { data: goalRow, error: goalErr } = await supabase
            .from("shops")
            .select("monthly_goal")
            .eq("id", shop.id)
            .maybeSingle();
          if (!goalErr) monthlyGoal = Number((goalRow as any)?.monthly_goal ?? 0);
        } catch {
          monthlyGoal = 0;
        }

        const [{ data: productRows }, { data: insightsRows }, { data: metricsRows }] =
          await Promise.all([
            supabase
              .from("products")
              .select("id, name, quantity, min_quantity, cost_price, selling_price, expiry_date, status")
              .eq("shop_id", shop.id),
            supabase
              .from("ai_price_suggestions")
              .select("id, product_id, type, reason, impact_text, current_price, suggested_price, priority")
              .eq("shop_id", shop.id)
              .order("created_at", { ascending: false })
              .limit(3),
            supabase
              .from("daily_shop_metrics")
              .select("day, revenue, gross_profit, net_profit")
              .eq("shop_id", shop.id)
              .order("day", { ascending: false })
              .limit(7),
          ]);

        const mappedProducts: Product[] = (productRows ?? []).map((p) => {
          const expiryDate = p.expiry_date ?? undefined;
          const daysToExpiry = expiryDate
            ? Math.ceil((new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            : undefined;
          return {
            id: String(p.id),
            name: p.name,
            category: "General",
            quantity: p.quantity ?? 0,
            minQuantity: p.min_quantity ?? 0,
            costPrice: Number(p.cost_price ?? 0),
            sellingPrice: Number(p.selling_price ?? 0),
            expiryDate,
            stockStatus: (p.status as Product["stockStatus"]) ?? "healthy",
            daysToExpiry,
            trend: "stable",
          };
        });
        setProducts(mappedProducts);

        const mappedInsights: AIInsight[] = (insightsRows ?? []).map((i) => {
          const productName = mappedProducts.find((p) => p.id === String(i.product_id))?.name ?? "Product";
          return {
            id: String(i.id),
            productId: String(i.product_id),
            productName,
            type: (i.type as AIInsight["type"]) ?? "trending",
            recommendation: i.reason ?? "No recommendation available",
            impact: i.impact_text ?? "No impact estimate",
            currentPrice: Number(i.current_price ?? 0),
            suggestedPrice: i.suggested_price == null ? undefined : Number(i.suggested_price),
            priority: (i.priority as AIInsight["priority"]) ?? "medium",
          };
        });
        setInsights(mappedInsights);

        const sortedMetrics = [...(metricsRows ?? [])].sort((a, b) => (a.day > b.day ? 1 : -1));
        const mappedChart: ChartDataPoint[] = sortedMetrics.map((m) => ({
          day: new Date(m.day).toLocaleDateString("en-IN", { weekday: "short" }),
          revenue: Number(m.revenue ?? 0),
          profit: Number(m.net_profit ?? m.gross_profit ?? 0),
        }));
        setChartData(mappedChart);

        const todayMetric = sortedMetrics.at(-1);
        const lowStockCount = mappedProducts.filter((p) => p.quantity <= p.minQuantity).length;
        const expiringCount = mappedProducts.filter((p) => (p.daysToExpiry ?? 999) <= 30).length;
        const topProduct = [...mappedProducts].sort((a, b) => b.quantity - a.quantity)[0]?.name ?? "N/A";

        // Monthly progress based on total monthly revenue.
        let monthlyRevenue = 0;
        let monthlyProgress = 0;
        try {
          const monthStart = new Date();
          monthStart.setDate(1);
          monthStart.setHours(0, 0, 0, 0);

          const nextMonth = new Date(monthStart);
          nextMonth.setMonth(monthStart.getMonth() + 1);

          const monthStartISO = monthStart.toISOString().slice(0, 10);
          const nextMonthISO = nextMonth.toISOString().slice(0, 10);

          const { data: monthRows, error: monthErr } = await supabase
            .from("daily_shop_metrics")
            .select("revenue")
            .eq("shop_id", shop.id)
            .gte("day", monthStartISO)
            .lt("day", nextMonthISO);

          if (!monthErr) {
            monthlyRevenue = (monthRows ?? []).reduce(
              (sum: number, r: any) => sum + Number(r.revenue ?? 0),
              0
            );
          }

          if (monthlyGoal > 0) {
            monthlyProgress = Math.max(
              0,
              Math.min(100, Math.round((monthlyRevenue / monthlyGoal) * 100))
            );
          }
        } catch {
          monthlyProgress = 0;
        }

        setStats({
          todayProfit: Number(todayMetric?.net_profit ?? todayMetric?.gross_profit ?? 0),
          todayRevenue: Number(todayMetric?.revenue ?? 0),
          monthlyGoal,
          monthlyProgress,
          totalProducts: mappedProducts.length,
          lowStockCount,
          expiringCount,
          topProduct,
        });
      } catch (error) {
        console.error("Failed to load dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const alertProducts = useMemo(
    () => products.filter((p) => p.stockStatus === "low" || p.stockStatus === "critical").slice(0, 3),
    [products]
  );
  const expiringProducts = useMemo(
    () => products.filter((p) => p.daysToExpiry !== undefined && p.daysToExpiry <= 30).slice(0, 3),
    [products]
  );

  return (
    <div className="space-y-10">
      {/* Hero Greeting */}
      <section className="animate-fade-in-up">
        <h2 className="text-4xl font-extrabold text-primary tracking-tight">
          Good Morning, {shopName}
        </h2>
        <p className="text-on-surface-variant mt-1 text-lg font-medium">
          Your shop is doing well.{" "}
          <span className="text-on-surface font-bold">
            {stats.lowStockCount + stats.expiringCount} items
          </span>{" "}
          need your attention today.
        </p>
      </section>

      {/* KPI Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in-up animate-delay-100">
        {[
          { label: "Today's Munafa", value: formatCurrency(stats.todayProfit), icon: "currency_rupee", color: "text-emerald-600", bg: "bg-emerald-50", change: "+12.5%" },
          { label: "Today's Revenue", value: formatCurrency(stats.todayRevenue), icon: "point_of_sale", color: "text-blue-600", bg: "bg-blue-50", change: "+8.2%" },
          { label: "Low Stock Items", value: stats.lowStockCount.toString(), icon: "warning", color: "text-amber-600", bg: "bg-amber-50", change: "Reorder soon" },
          { label: "Near Expiry", value: stats.expiringCount.toString(), icon: "alarm", color: "text-red-600", bg: "bg-red-50", change: "Act today" },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-surface-container-lowest rounded-xl p-5 shadow-card hover:shadow-card-hover transition-all duration-200">
            <div className="flex items-start justify-between mb-3">
              <span className="text-[11px] font-extrabold uppercase tracking-[0.15em] text-slate-400">{kpi.label}</span>
              <div className={`w-8 h-8 ${kpi.bg} rounded-lg flex items-center justify-center`}>
                <span className={`material-symbols-outlined ${kpi.color} text-[18px]`}>{kpi.icon}</span>
              </div>
            </div>
            <p className="text-3xl font-extrabold text-on-surface tracking-tight">{kpi.value}</p>
            <p className={`text-xs font-bold mt-1 ${kpi.color}`}>{kpi.change}</p>
          </div>
        ))}
      </section>

      {/* Main grid */}
      <div className="grid grid-cols-12 gap-8">
        {/* Left: Chart + Alerts */}
        <div className="col-span-12 lg:col-span-8 space-y-8">
          {/* Revenue chart */}
          <div className="bg-surface-container-lowest rounded-xl p-7 shadow-card animate-fade-in-up animate-delay-200">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-slate-400 mb-1">Weekly Revenue</h3>
                <p className="text-2xl font-extrabold text-on-surface tracking-tight">This Week</p>
              </div>
              <div className="flex items-center gap-4 text-xs font-bold">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-primary-container inline-block"></span>Revenue</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-400 inline-block"></span>Profit</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fontWeight: 700, fill: "#6f797c" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#bec8cb" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(val) => [formatCurrency(Number(val)), ""]}
                  contentStyle={{ fontFamily: "Manrope", fontSize: 12, fontWeight: 700, borderRadius: 12, border: "none", boxShadow: "0 8px 24px rgba(0,0,0,0.08)" }}
                />
                <Bar dataKey="revenue" fill="#006778" radius={[6, 6, 0, 0]} />
                <Bar dataKey="profit" fill="#34d399" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Alerts row */}
          <div className="grid grid-cols-2 gap-6">
            {/* Low Stock */}
            <div className="bg-surface-container-lowest rounded-xl p-6 shadow-card animate-fade-in-up animate-delay-300">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-500 text-[20px]">warning</span>
                  <h3 className="text-sm font-extrabold text-on-surface">Low Stock</h3>
                </div>
                <Link href="/inventory" className="text-xs font-bold text-primary-container hover:underline">View all</Link>
              </div>
              <div className="space-y-3">
                {alertProducts.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b border-surface-container last:border-0">
                    <div>
                      <p className="text-xs font-bold text-on-surface truncate max-w-[140px]">{p.name}</p>
                      <p className="text-[11px] text-on-surface-variant font-medium">{p.quantity} units left</p>
                    </div>
                    <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wide ${p.stockStatus === "critical" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"}`}>
                      {p.stockStatus}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Expiring Soon */}
            <div className="bg-surface-container-lowest rounded-xl p-6 shadow-card animate-fade-in-up animate-delay-400">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-red-500 text-[20px]">alarm</span>
                  <h3 className="text-sm font-extrabold text-on-surface">Expiring Soon</h3>
                </div>
                <Link href="/inventory" className="text-xs font-bold text-primary-container hover:underline">View all</Link>
              </div>
              <div className="space-y-3">
                {expiringProducts.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b border-surface-container last:border-0">
                    <div>
                      <p className="text-xs font-bold text-on-surface truncate max-w-[140px]">{p.name}</p>
                      <p className="text-[11px] text-on-surface-variant font-medium">Expires: {p.expiryDate}</p>
                    </div>
                    <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wide ${(p.daysToExpiry ?? 99) <= 7 ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"}`}>
                      {p.daysToExpiry}d
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Monthly goal + Top insights */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          {/* Monthly goal */}
          <div className="bg-surface-container-lowest rounded-xl p-6 shadow-card animate-fade-in-up animate-delay-200">
            <h3 className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-slate-400 mb-4">Monthly Goal</h3>
            <p className="text-3xl font-extrabold text-on-surface tracking-tight mb-1">
              {stats.monthlyProgress}%
            </p>
            <p className="text-xs font-medium text-on-surface-variant mb-3">
              of {formatCurrency(stats.monthlyGoal)} target
            </p>
            <div className="w-full h-2.5 bg-surface-container-low rounded-full overflow-hidden">
              <div
                className="h-full cta-gradient rounded-full transition-all duration-1000"
                style={{ width: `${stats.monthlyProgress}%` }}
              />
            </div>
            <p className="text-xs font-bold text-emerald-600 mt-3 flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">trending_up</span>
              On track to hit target!
            </p>
          </div>

          {/* Top AI insights */}
          <div className="bg-surface-container-lowest rounded-xl p-6 shadow-card animate-fade-in-up animate-delay-300">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-extrabold text-on-surface">Top AI Tips</h3>
              <Link href="/insights" className="text-xs font-bold text-primary-container hover:underline">See all</Link>
            </div>
            <div className="space-y-3">
                {insights.map((insight) => (
                <div key={insight.id} className={`p-3 rounded-xl border ${insight.priority === "high" ? "bg-red-50 border-red-100" : "bg-amber-50 border-amber-100"}`}>
                  <p className="text-xs font-extrabold text-on-surface">{insight.productName}</p>
                  <p className="text-[11px] font-medium text-on-surface-variant mt-0.5">{insight.recommendation}</p>
                  <p className={`text-[10px] font-bold mt-1.5 ${insight.priority === "high" ? "text-red-600" : "text-amber-600"}`}>
                    {insight.impact}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {loading && (
        <p className="text-sm font-medium text-on-surface-variant">
          Loading your live dashboard data...
        </p>
      )}
    </div>
  );
}
