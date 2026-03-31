"use client";
import { useEffect, useState } from "react";
import { mockExpenses } from "@/lib/mockData";
import { formatCurrency } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { Expense } from "@/types";

export default function SettingsPage() {
  const [expenses, setExpenses] = useState<Expense[]>(mockExpenses);
  const [shopName, setShopName] = useState("Your Shop");
  const [ownerName, setOwnerName] = useState("Shop Owner");
  const [language, setLanguage] = useState("English");
  const [monthlyGoal, setMonthlyGoal] = useState<number>(0);
  const [notifications, setNotifications] = useState({ expiry: true, lowStock: true, aiTips: true });
  const [saved, setSaved] = useState(false);

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

  const updateExpense = (id: string, amount: number) => {
    setExpenses(expenses.map((e) => e.id === id ? { ...e, amount } : e));
  };

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        const user = userData.user;
        if (!user) return;

        const [{ data: profile }, { data: shop }] = await Promise.all([
          supabase.from("users").select("full_name").eq("id", user.id).maybeSingle(),
          supabase
            .from("shops")
            .select("id, name, language")
            .eq("owner_user_id", user.id)
            .order("created_at", { ascending: true })
            .maybeSingle(),
        ]);

        const resolvedOwner =
          profile?.full_name ||
          (user.user_metadata?.full_name as string | undefined) ||
          user.email ||
          "Shop Owner";
        setOwnerName(resolvedOwner);

        if (!shop) return;

        setShopName(shop.name ?? "Your Shop");
        setLanguage(shop.language ?? "English");

        // `monthly_goal` may not exist yet in DB. Try to load it, but don't fail.
        try {
          const { data: goalRow, error: goalErr } = await supabase
            .from("shops")
            .select("monthly_goal")
            .eq("id", shop.id)
            .maybeSingle();

          if (!goalErr) setMonthlyGoal(Number((goalRow as any)?.monthly_goal ?? 0));
        } catch {
          // ignore
        }

        const monthStart = new Date();
        monthStart.setDate(1);
        const month = monthStart.toISOString().slice(0, 10);

        const [{ data: categories }, { data: monthly }] = await Promise.all([
          // `expense_categories` might not have an `icon` column. Keep this query minimal.
          supabase.from("expense_categories").select("id, code, label"),
          supabase
            .from("shop_monthly_expenses")
            .select("category_id, amount, month")
            .eq("shop_id", shop.id)
            .eq("month", month),
        ]);

        if (!categories) return;

        const amountByCategoryId = new Map(
          (monthly ?? []).map((m: any) => [m.category_id, Number(m.amount ?? 0)])
        );

        const updatedExpenses: Expense[] = categories.map((c: any) => {
          const base =
            mockExpenses.find((e) => e.label === c.label) ??
            ({
              id: c.code,
              label: c.label,
              amount: 0,
              icon: "payments",
            } as Expense);

          const amount = amountByCategoryId.get(c.id) ?? base.amount ?? 0;
          return { ...base, amount };
        });

        setExpenses(updatedExpenses);
      } catch (e) {
        console.error("Failed to load settings from Supabase:", e);
      }
    };

    void loadSettings();
  }, []);

  const handleSave = async () => {
    try {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return;

      const { data: shop, error: shopSelectError } = await supabase
        .from("shops")
        .select("id")
        .eq("owner_user_id", user.id)
        .maybeSingle();
      if (shopSelectError || !shop) return;

      await supabase
        .from("shops")
        .update({ name: shopName, language })
        .eq("id", shop.id);

      // Persist monthly goal if column exists.
      try {
        await supabase
          .from("shops")
          .update({ monthly_goal: monthlyGoal })
          .eq("id", shop.id);
      } catch {
        // ignore
      }

      const monthStart = new Date();
      monthStart.setDate(1);
      const month = monthStart.toISOString().slice(0, 10);

      const { data: categories } = await supabase
        .from("expense_categories")
        .select("id, label");

      const byLabel = new Map((categories ?? []).map((c: any) => [c.label, c.id]));

      const upserts = expenses
        .map((e) => {
          const categoryId = byLabel.get(e.label);
          if (!categoryId) return null;
          return {
            shop_id: shop.id,
            category_id: categoryId,
            month,
            amount: e.amount,
          };
        })
        .filter(Boolean);

      if (upserts.length > 0) {
        await supabase
          .from("shop_monthly_expenses")
          .upsert(upserts as any, { onConflict: "shop_id,category_id,month" });
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error("Failed to save settings:", e);
    }
  };

  return (
    <div className="max-w-3xl space-y-8 animate-fade-in-up">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight text-on-surface">Settings</h1>
        <p className="text-on-surface-variant mt-1 font-medium">Manage your shop info and preferences</p>
      </div>

      {/* Shop Info */}
      <div className="bg-surface-container-lowest rounded-xl p-7 shadow-card space-y-5">
        <h2 className="text-sm font-extrabold uppercase tracking-[0.15em] text-slate-400">Shop Information</h2>
        <div className="grid grid-cols-2 gap-5">
          <div>
            <label className="text-xs font-extrabold uppercase tracking-wider text-on-surface-variant block mb-2">Shop Name</label>
            <input
              value={shopName} onChange={(e) => setShopName(e.target.value)}
              className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary-container/30 transition-all"
            />
          </div>
          <div>
            <label className="text-xs font-extrabold uppercase tracking-wider text-on-surface-variant block mb-2">Language</label>
            <select
              value={language} onChange={(e) => setLanguage(e.target.value)}
              className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-primary-container/30 transition-all text-on-surface"
            >
              {["English", "Hindi", "Marathi", "Tamil", "Telugu", "Bengali", "Gujarati"].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs font-extrabold uppercase tracking-wider text-on-surface-variant block mb-2">
            Monthly Goal (₹)
          </label>
          <input
            type="number"
            min="0"
            value={monthlyGoal}
            onChange={(e) => setMonthlyGoal(Number(e.target.value || 0))}
            className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary-container/30 transition-all"
          />
        </div>
        <div>
          <label className="text-xs font-extrabold uppercase tracking-wider text-on-surface-variant block mb-2">Owner Name</label>
          <input
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary-container/30 transition-all max-w-xs"
          />
        </div>
      </div>

      {/* Monthly Expenses */}
      <div className="bg-surface-container-lowest rounded-xl p-7 shadow-card space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold uppercase tracking-[0.15em] text-slate-400">Monthly Expenses</h2>
          <div className="text-right">
            <p className="text-xs font-bold text-on-surface-variant">Total</p>
            <p className="text-xl font-extrabold text-on-surface">{formatCurrency(totalExpenses)}</p>
          </div>
        </div>
        <p className="text-xs text-on-surface-variant font-medium -mt-2">
          These expenses are used by AI to calculate your actual profit margin
        </p>
        <div className="space-y-5">
          {expenses.map((exp) => (
            <div key={exp.id}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary-container text-[18px]">{exp.icon}</span>
                  <span className="text-sm font-bold text-on-surface">{exp.label}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-on-surface-variant font-medium">₹</span>
                  <input
                    type="number" min="0" value={exp.amount}
                    onChange={(e) => updateExpense(exp.id, Number(e.target.value))}
                    className="w-24 bg-surface-container-low border-none rounded-lg px-3 py-1.5 text-sm font-extrabold text-right outline-none focus:ring-2 focus:ring-primary-container/30 transition-all"
                  />
                </div>
              </div>
              <input
                type="range" min="0" max="30000" step="100" value={exp.amount}
                onChange={(e) => updateExpense(exp.id, Number(e.target.value))}
                style={{ backgroundSize: `${(exp.amount / 30000) * 100}% 100%` }}
                className="w-full"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-surface-container-lowest rounded-xl p-7 shadow-card space-y-5">
        <h2 className="text-sm font-extrabold uppercase tracking-[0.15em] text-slate-400">Notifications</h2>
        {[
          { key: "expiry", label: "Expiry Date Alerts", desc: "Alert when products are expiring soon" },
          { key: "lowStock", label: "Low Stock Warnings", desc: "Alert when stock falls below minimum" },
          { key: "aiTips", label: "AI Pricing Tips", desc: "Get daily suggestions to boost profit" },
        ].map((n) => (
          <div key={n.key} className="flex items-center justify-between py-3 border-b border-surface-container last:border-0">
            <div>
              <p className="text-sm font-bold text-on-surface">{n.label}</p>
              <p className="text-xs text-on-surface-variant font-medium">{n.desc}</p>
            </div>
            <button
              onClick={() => setNotifications({ ...notifications, [n.key]: !notifications[n.key as keyof typeof notifications] })}
              className={`w-12 h-6 rounded-full transition-all duration-200 relative ${
                notifications[n.key as keyof typeof notifications] ? "cta-gradient" : "bg-surface-container-high"
              }`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${
                notifications[n.key as keyof typeof notifications] ? "left-7" : "left-1"
              }`} />
            </button>
          </div>
        ))}
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        className={`w-full py-4 rounded-xl font-bold text-sm transition-all active:scale-[0.98] shadow-card ${
          saved ? "bg-emerald-500 text-white" : "cta-gradient text-white hover:opacity-90"
        }`}
      >
        {saved ? "✓ Settings Saved!" : "Save Settings"}
      </button>
    </div>
  );
}
