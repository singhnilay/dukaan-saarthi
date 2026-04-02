"use client";
import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  fetchExpenses, saveExpenses, addExpenseCategory, deleteExpenseCategory, getShopIdPublic,
} from "@/lib/finances";
import type { Expense } from "@/types";

const ICON_OPTIONS = [
  { icon: "home",           label: "Rent / Shop" },
  { icon: "bolt",           label: "Electricity" },
  { icon: "group",          label: "Salaries" },
  { icon: "wifi",           label: "Internet" },
  { icon: "inventory_2",    label: "Packaging" },
  { icon: "construction",   label: "Maintenance" },
  { icon: "local_shipping", label: "Supplies" },
  { icon: "water_drop",     label: "Water" },
  { icon: "security",       label: "Security" },
  { icon: "receipt_long",   label: "Other" },
];

export default function SettingsPage() {
  const [expenses, setExpenses]         = useState<Expense[]>([]);
  const [shopId, setShopId]             = useState<string | null>(null);
  const [shopName, setShopName]         = useState("Your Shop");
  const [ownerName, setOwnerName]       = useState("Shop Owner");
  const [language, setLanguage]         = useState("English");
  const [monthlyGoal, setMonthlyGoal]   = useState<number>(0);
  const [notifications, setNotifications] = useState({ expiry: true, lowStock: true, aiTips: true });
  const [saved, setSaved]               = useState(false);
  const [loading, setLoading]           = useState(true);

  /* Add-expense inline form state */
  const [showAddExp, setShowAddExp]     = useState(false);
  const [newLabel, setNewLabel]         = useState("");
  const [newIcon, setNewIcon]           = useState("receipt_long");
  const [addingExp, setAddingExp]       = useState(false);

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

  /* ── Load everything from Supabase ─────────────────────────────────────── */
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from("users").select("full_name").eq("id", user.id).maybeSingle();
        const name = profile?.full_name ||
          (user.user_metadata?.full_name as string | undefined) || user.email || "Shop Owner";
        setOwnerName(name);

        const { data: shop } = await supabase
          .from("shops").select("id,name,language,monthly_goal")
          .eq("owner_user_id", user.id).maybeSingle();

        if (shop) {
          setShopId(shop.id);
          setShopName(shop.name ?? "Your Shop");
          setLanguage(shop.language ?? "English");
          setMonthlyGoal(Number(shop.monthly_goal ?? 0));
        }

        const exps = await fetchExpenses();
        setExpenses(exps);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    void load();
  }, []);

  /* ── Save ───────────────────────────────────────────────────────────────── */
  const handleSave = async () => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: shop } = await supabase
        .from("shops").select("id").eq("owner_user_id", user.id).maybeSingle();
      if (!shop) return;
      await supabase.from("shops")
        .update({ name: shopName, language, monthly_goal: monthlyGoal }).eq("id", shop.id);
      await saveExpenses(expenses);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { console.error(e); }
  };

  /* ── Add custom expense ─────────────────────────────────────────────────── */
  const handleAddExpense = async () => {
    if (!newLabel.trim() || !shopId) return;
    setAddingExp(true);
    const created = await addExpenseCategory(newLabel.trim(), newIcon, shopId);
    if (created) setExpenses(prev => [...prev, created]);
    setNewLabel(""); setNewIcon("receipt_long"); setShowAddExp(false); setAddingExp(false);
  };

  /* ── Delete expense category ────────────────────────────────────────────── */
  const handleDeleteExpense = async (id: string) => {
    setExpenses(prev => prev.filter(e => e.id !== id));
    await deleteExpenseCategory(id);
  };

  const updateAmount = (id: string, amount: number) =>
    setExpenses(prev => prev.map(e => e.id === id ? { ...e, amount } : e));

  if (loading) return (
    <div className="max-w-3xl space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-surface-container rounded-xl"/>
      {[...Array(3)].map((_,i) => <div key={i} className="bg-surface-container-lowest rounded-xl p-7 shadow-card h-48"/>)}
    </div>
  );

  return (
    <div className="max-w-3xl space-y-8 animate-fade-in-up">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight text-on-surface">Settings</h1>
        <p className="text-on-surface-variant mt-1 font-medium">Manage your shop info and preferences</p>
      </div>

      {/* ── Shop Info ───────────────────────────────────────────────────────── */}
      <div className="bg-surface-container-lowest rounded-xl p-7 shadow-card space-y-5">
        <h2 className="text-xs font-extrabold uppercase tracking-[0.15em] text-slate-400">Shop Information</h2>
        <div className="grid grid-cols-2 gap-5">
          <div>
            <label className="text-xs font-extrabold uppercase tracking-wider text-on-surface-variant block mb-2">Shop Name</label>
            <input value={shopName} onChange={e => setShopName(e.target.value)}
              className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary-container/30 transition-all"/>
          </div>
          <div>
            <label className="text-xs font-extrabold uppercase tracking-wider text-on-surface-variant block mb-2">Language</label>
            <select value={language} onChange={e => setLanguage(e.target.value)}
              className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-primary-container/30 transition-all text-on-surface">
              {["English","Hindi","Marathi","Tamil","Telugu","Bengali","Gujarati","Kannada"].map(l => <option key={l}>{l}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-5">
          <div>
            <label className="text-xs font-extrabold uppercase tracking-wider text-on-surface-variant block mb-2">Owner Name</label>
            <input value={ownerName} onChange={e => setOwnerName(e.target.value)}
              className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary-container/30 transition-all"/>
          </div>
          <div>
            <label className="text-xs font-extrabold uppercase tracking-wider text-on-surface-variant block mb-2">Monthly Revenue Goal (₹)</label>
            <input type="number" min="0" value={monthlyGoal} onChange={e => setMonthlyGoal(Number(e.target.value))}
              className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary-container/30 transition-all"/>
          </div>
        </div>
      </div>

      {/* ── Monthly Expenses ────────────────────────────────────────────────── */}
      <div className="bg-surface-container-lowest rounded-xl p-7 shadow-card space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xs font-extrabold uppercase tracking-[0.15em] text-slate-400">Monthly Expenses</h2>
            <p className="text-xs text-on-surface-variant font-medium mt-0.5">Used by AI to calculate your real profit</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold text-on-surface-variant">Total</p>
            <p className="text-xl font-extrabold text-on-surface">{formatCurrency(totalExpenses)}</p>
          </div>
        </div>

        {/* Expense rows */}
        <div className="space-y-5">
          {expenses.map(exp => (
            <div key={exp.id} className="group">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary-container text-[18px]">{exp.icon}</span>
                  <span className="text-sm font-bold text-on-surface">{exp.label}</span>
                  {exp.amount > 0 && (
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{formatCurrency(exp.amount)}/mo</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-on-surface-variant font-medium">₹</span>
                  <input type="number" min="0" value={exp.amount}
                    onChange={e => updateAmount(exp.id, Number(e.target.value))}
                    className="w-28 bg-surface-container-low border-none rounded-lg px-3 py-1.5 text-sm font-extrabold text-right outline-none focus:ring-2 focus:ring-primary-container/30 transition-all"/>
                  <button onClick={() => handleDeleteExpense(exp.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    title="Remove expense">
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </div>
              </div>
              <input type="range" min="0" max="30000" step="100" value={exp.amount}
                onChange={e => updateAmount(exp.id, Number(e.target.value))}
                style={{ backgroundSize: `${Math.min((exp.amount/30000)*100,100)}% 100%` }}
                className="w-full"/>
            </div>
          ))}
        </div>

        {/* Add expense inline form */}
        {showAddExp ? (
          <div className="border border-outline-variant rounded-xl p-4 space-y-4 bg-surface-container-low">
            <p className="text-xs font-extrabold uppercase tracking-wider text-on-surface-variant">New Expense Category</p>
            <div className="flex gap-3">
              <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
                placeholder="e.g. Water Bill" maxLength={40}
                className="flex-1 bg-white border-none rounded-xl px-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-primary-container/30 placeholder:text-slate-400 transition-all"/>
              <select value={newIcon} onChange={e => setNewIcon(e.target.value)}
                className="bg-white border-none rounded-xl px-3 py-2.5 text-sm font-bold outline-none text-on-surface cursor-pointer">
                {ICON_OPTIONS.map(o => <option key={o.icon} value={o.icon}>{o.label}</option>)}
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowAddExp(false); setNewLabel(""); }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-on-surface-variant bg-white hover:bg-surface-container transition-all">
                Cancel
              </button>
              <button onClick={handleAddExpense} disabled={addingExp || !newLabel.trim()}
                className="px-4 py-2 rounded-xl text-xs font-bold cta-gradient text-white shadow-card hover:opacity-90 active:scale-95 transition-all disabled:opacity-50">
                {addingExp ? "Adding…" : "Add Expense"}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAddExp(true)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-outline-variant text-xs font-bold text-on-surface-variant hover:text-primary-container hover:border-primary-container transition-all">
            <span className="material-symbols-outlined text-[18px]">add</span>Add Custom Expense
          </button>
        )}
      </div>

      {/* ── Notifications ───────────────────────────────────────────────────── */}
      <div className="bg-surface-container-lowest rounded-xl p-7 shadow-card space-y-5">
        <h2 className="text-xs font-extrabold uppercase tracking-[0.15em] text-slate-400">Notifications</h2>
        {[
          { key: "expiry",   label: "Expiry Date Alerts",  desc: "Alert when products are expiring soon" },
          { key: "lowStock", label: "Low Stock Warnings",  desc: "Alert when stock falls below minimum" },
          { key: "aiTips",   label: "AI Pricing Tips",     desc: "Get daily suggestions to boost profit" },
        ].map(n => (
          <div key={n.key} className="flex items-center justify-between py-3 border-b border-surface-container last:border-0">
            <div>
              <p className="text-sm font-bold text-on-surface">{n.label}</p>
              <p className="text-xs text-on-surface-variant font-medium">{n.desc}</p>
            </div>
            <button
              onClick={() => setNotifications(prev => ({ ...prev, [n.key]: !prev[n.key as keyof typeof prev] }))}
              className={`w-12 h-6 rounded-full transition-all duration-200 relative flex-shrink-0 ${
                notifications[n.key as keyof typeof notifications] ? "cta-gradient" : "bg-surface-container-high"
              }`}>
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${
                notifications[n.key as keyof typeof notifications] ? "left-7" : "left-1"
              }`}/>
            </button>
          </div>
        ))}
      </div>

      {/* ── Save button ─────────────────────────────────────────────────────── */}
      <button onClick={handleSave}
        className={`w-full py-4 rounded-xl font-bold text-sm transition-all active:scale-[0.98] shadow-card ${
          saved ? "bg-emerald-500 text-white" : "cta-gradient text-white hover:opacity-90"
        }`}>
        {saved ? "✓ Settings Saved!" : "Save Settings"}
      </button>
    </div>
  );
}
