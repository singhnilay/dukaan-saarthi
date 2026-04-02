"use client";
import { useState, useMemo, useEffect, useCallback } from "react";
import { Bill, SaleTransaction, BillStatus, MonthlySummary, Expense } from "@/types";
import { formatCurrency } from "@/lib/utils";
import {
  fetchBills, toggleBillPaid, addBill, deleteBill,
  fetchSales, fetchMonthlySummary, fetchExpenses, getShopIdPublic,
} from "@/lib/finances";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

const TABS = ["Overview", "Bills & Payments", "Sales Ledger"] as const;
type Tab = typeof TABS[number];

const STATUS_STYLE: Record<BillStatus, { chip: string; dot: string; label: string }> = {
  paid:    { chip: "bg-emerald-50 text-emerald-700 border-emerald-100", dot: "bg-emerald-500",  label: "Paid"    },
  unpaid:  { chip: "bg-amber-50  text-amber-700  border-amber-100",    dot: "bg-amber-400",    label: "Unpaid"  },
  overdue: { chip: "bg-red-50    text-red-700    border-red-100",       dot: "bg-red-500",      label: "Overdue" },
};
const PIE_COLORS = ["#006778","#0ea5e9","#34d399","#f59e0b","#f87171","#a78bfa","#fb923c"];

// ── Add-bill modal state ──────────────────────────────────────────────────────
const BLANK_BILL = { label:"", category:"other", icon:"receipt_long", amount:"", dueDate:"", recurring:false };

export default function FinancesPage() {
  const [activeTab, setActiveTab]         = useState<Tab>("Overview");
  const [bills, setBills]                 = useState<Bill[]>([]);
  const [sales, setSales]                 = useState<SaleTransaction[]>([]);
  const [monthly, setMonthly]             = useState<MonthlySummary[]>([]);
  const [expenses, setExpenses]           = useState<Expense[]>([]);
  const [shopId, setShopId]               = useState<string | null>(null);
  const [loading, setLoading]             = useState(true);
  const [billFilter, setBillFilter]       = useState<"all" | BillStatus>("all");
  const [salesFilter, setSalesFilter]     = useState<"all" | string>("all");
  const [showAddBill, setShowAddBill]     = useState(false);
  const [newBill, setNewBill]             = useState(BLANK_BILL);
  const [addingBill, setAddingBill]       = useState(false);

  // ── Load all data ──────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [b, s, m, e, sid] = await Promise.all([
        fetchBills(), fetchSales(30), fetchMonthlySummary(), fetchExpenses(), getShopIdPublic(),
      ]);
      setBills(b); setSales(s); setMonthly(m); setExpenses(e); setShopId(sid);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // ── Derived numbers ────────────────────────────────────────────────────────
  const totalBilled    = bills.reduce((s,b) => s + b.amount, 0);
  const totalPaid      = bills.filter(b=>b.status==="paid").reduce((s,b)=>s+b.amount,0);
  const totalUnpaid    = bills.filter(b=>b.status==="unpaid").reduce((s,b)=>s+b.amount,0);
  const totalOverdue   = bills.filter(b=>b.status==="overdue").reduce((s,b)=>s+b.amount,0);
  const monthlyProfit  = monthly.length ? monthly[monthly.length-1].profit : 0;
  const cashInHand     = monthlyProfit - totalUnpaid - totalOverdue;
  const totalRevenue   = sales.reduce((s,t)=>s+t.totalRevenue,0);
  const totalSalesProfit = sales.reduce((s,t)=>s+t.profit,0);

  const filteredBills  = billFilter==="all" ? bills : bills.filter(b=>b.status===billFilter);
  const uniqueDates    = useMemo(()=>[...new Set(sales.map(s=>s.date))].sort().reverse(),[sales]);
  const filteredSales  = salesFilter==="all" ? [...sales] : sales.filter(s=>s.date===salesFilter);

  const categoryTotals = useMemo(()=>{
    const m: Record<string,number> = {};
    sales.forEach(s=>{ m[s.category]=(m[s.category]??0)+s.totalRevenue; });
    return Object.entries(m).map(([name,value])=>({name,value}));
  },[sales]);

  // ── Bill interactions ──────────────────────────────────────────────────────
  const handleTogglePaid = async (bill: Bill) => {
    const nowPaid = bill.status !== "paid";
    setBills(prev => prev.map(b => b.id!==bill.id ? b : {
      ...b,
      status: nowPaid ? "paid" : "unpaid",
      paidDate: nowPaid ? new Date().toISOString().split("T")[0] : undefined,
    }));
    await toggleBillPaid(bill);
  };

  const handleDeleteBill = async (id: string) => {
    setBills(prev => prev.filter(b=>b.id!==id));
    await deleteBill(id);
  };

  const handleAddBill = async () => {
    if (!shopId || !newBill.label || !newBill.amount || !newBill.dueDate) return;
    setAddingBill(true);
    const created = await addBill(shopId, {
      label: newBill.label, category: newBill.category as Bill["category"],
      icon: newBill.icon, amount: Number(newBill.amount),
      dueDate: newBill.dueDate, recurring: newBill.recurring,
    });
    if (created) setBills(prev=>[...prev, created]);
    setNewBill(BLANK_BILL);
    setShowAddBill(false);
    setAddingBill(false);
  };

  // ── Tooltip ────────────────────────────────────────────────────────────────
  const ChartTip = ({ active, payload, label }: {active?:boolean; payload?:{name:string;value:number;color:string}[]; label?:string}) => {
    if (!active||!payload?.length) return null;
    return (
      <div className="bg-white rounded-xl shadow-card-hover p-3 text-xs font-bold border border-gray-100 min-w-[140px]">
        <p className="text-on-surface-variant mb-2 font-extrabold uppercase tracking-wide">{label}</p>
        {payload.map(p=>(
          <div key={p.name} className="flex justify-between gap-6">
            <span style={{color:p.color}}>{p.name}</span>
            <span className="text-on-surface">{formatCurrency(p.value)}</span>
          </div>
        ))}
      </div>
    );
  };

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-surface-container rounded-xl"/>
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_,i)=>(
          <div key={i} className="bg-surface-container-lowest rounded-xl p-5 shadow-card space-y-3">
            <div className="h-3 w-20 bg-surface-container rounded"/>
            <div className="h-7 w-28 bg-surface-container rounded-xl"/>
          </div>
        ))}
      </div>
      <div className="bg-surface-container-lowest rounded-xl p-6 shadow-card h-64"/>
    </div>
  );

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8 animate-fade-in-up">

      {/* Page header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-on-surface">Finances</h1>
          <p className="text-on-surface-variant mt-1 font-medium">
            Full picture of your money — what came in, what went out, what&apos;s left
          </p>
        </div>
        <div className={`flex items-center gap-3 px-5 py-3 rounded-2xl shadow-card border ${cashInHand>=0?"bg-emerald-50 border-emerald-100":"bg-red-50 border-red-100"}`}>
          <span className={`material-symbols-outlined text-[22px] ${cashInHand>=0?"text-emerald-600":"text-red-600"}`}>account_balance_wallet</span>
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant">Est. Cash in Hand</p>
            <p className={`text-xl font-extrabold tracking-tight ${cashInHand>=0?"text-emerald-700":"text-red-700"}`}>{formatCurrency(cashInHand)}</p>
          </div>
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex gap-1 bg-surface-container-low p-1 rounded-xl w-fit">
        {TABS.map(tab=>(
          <button key={tab} onClick={()=>setActiveTab(tab)}
            className={`px-5 py-2 rounded-lg text-sm font-bold transition-all duration-200 ${
              activeTab===tab ? "bg-white text-primary-container shadow-card" : "text-on-surface-variant hover:text-on-surface"
            }`}>
            {tab}
          </button>
        ))}
      </div>

      {/* ══════════════════ OVERVIEW ══════════════════════════════════════ */}
      {activeTab==="Overview" && (
        <div className="space-y-8">
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label:"This Month Revenue", value:formatCurrency(monthly[monthly.length-1]?.revenue??0), icon:"point_of_sale", bg:"bg-blue-50",    ic:"text-blue-600",    sub:"Sales this month" },
              { label:"Total Expenses",     value:formatCurrency(totalBilled),                            icon:"receipt_long",  bg:"bg-amber-50",   ic:"text-amber-600",   sub:`${bills.filter(b=>b.status==="paid").length}/${bills.length} bills paid` },
              { label:"Net Profit",         value:formatCurrency(monthly[monthly.length-1]?.profit??0),   icon:"savings",       bg:"bg-emerald-50", ic:"text-emerald-600", sub:"After expenses" },
              { label:"Overdue Payments",   value:formatCurrency(totalOverdue),                           icon:"warning",       bg:"bg-red-50",     ic:"text-red-600",     sub:`${bills.filter(b=>b.status==="overdue").length} bills overdue` },
            ].map(k=>(
              <div key={k.label} className="bg-surface-container-lowest rounded-xl p-5 shadow-card hover:shadow-card-hover transition-all">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-slate-400 leading-tight">{k.label}</span>
                  <div className={`w-8 h-8 ${k.bg} rounded-lg flex items-center justify-center`}>
                    <span className={`material-symbols-outlined ${k.ic} text-[18px]`}>{k.icon}</span>
                  </div>
                </div>
                <p className="text-2xl font-extrabold text-on-surface tracking-tight">{k.value}</p>
                <p className="text-[11px] font-bold text-on-surface-variant mt-1">{k.sub}</p>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-12 gap-6">
            {/* Area chart */}
            <div className="col-span-12 lg:col-span-8 bg-surface-container-lowest rounded-xl p-6 shadow-card">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-1">6-Month Trend</p>
              <p className="text-lg font-extrabold text-on-surface mb-5">Revenue · Expenses · Profit</p>
              {monthly.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-on-surface-variant text-sm font-bold">
                  <span className="material-symbols-outlined mr-2 text-slate-300">bar_chart</span>
                  No sales data yet — add sale transactions to see trends
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={monthly}>
                    <defs>
                      {[["gRev","#006778"],["gExp","#f59e0b"],["gPro","#34d399"]].map(([id,c])=>(
                        <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={c} stopOpacity={0.15}/>
                          <stop offset="95%" stopColor={c} stopOpacity={0}/>
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false}/>
                    <XAxis dataKey="month" tick={{fontSize:11,fontWeight:700,fill:"#6f797c"}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fontSize:10,fill:"#bec8cb"}} axisLine={false} tickLine={false} tickFormatter={v=>`₹${(v/1000).toFixed(0)}k`}/>
                    <Tooltip content={<ChartTip/>}/>
                    <Area type="monotone" dataKey="revenue"  name="Revenue"  stroke="#006778" strokeWidth={2} fill="url(#gRev)"/>
                    <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#f59e0b" strokeWidth={2} fill="url(#gExp)"/>
                    <Area type="monotone" dataKey="profit"   name="Profit"   stroke="#34d399" strokeWidth={2} fill="url(#gPro)"/>
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Expense pie */}
            <div className="col-span-12 lg:col-span-4 bg-surface-container-lowest rounded-xl p-6 shadow-card">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-1">Expense Breakdown</p>
              <p className="text-lg font-extrabold text-on-surface mb-3">This Month</p>
              {expenses.every(e=>e.amount===0) ? (
                <div className="flex items-center justify-center h-36 text-xs font-bold text-on-surface-variant">No expense data</div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={expenses.filter(e=>e.amount>0).map(e=>({name:e.label,value:e.amount}))}
                        cx="50%" cy="50%" innerRadius={44} outerRadius={72} paddingAngle={3} dataKey="value">
                        {expenses.filter(e=>e.amount>0).map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                      </Pie>
                      <Tooltip formatter={(v)=>[formatCurrency(Number(v)),""]} contentStyle={{fontFamily:"Manrope",fontSize:11,fontWeight:700,borderRadius:10,border:"none",boxShadow:"0 4px 16px rgba(0,0,0,0.08)"}}/>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 mt-1">
                    {expenses.filter(e=>e.amount>0).map((e,i)=>(
                      <div key={e.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{background:PIE_COLORS[i%PIE_COLORS.length]}}/>
                          <span className="text-[11px] font-bold text-on-surface-variant truncate max-w-[120px]">{e.label}</span>
                        </div>
                        <span className="text-[11px] font-extrabold text-on-surface">{formatCurrency(e.amount)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Bills quick-view */}
          <div className="bg-surface-container-lowest rounded-xl p-6 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <p className="text-base font-extrabold text-on-surface">Bills Summary</p>
              <button onClick={()=>setActiveTab("Bills & Payments")} className="text-xs font-bold text-primary-container hover:underline flex items-center gap-1">
                Manage all <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </button>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[
                {label:"Total Billed", value:formatCurrency(totalBilled), icon:"receipt_long", style:"text-on-surface"},
                {label:"Paid",         value:formatCurrency(totalPaid),   icon:"check_circle",  style:"text-emerald-600"},
                {label:"Still Owed",   value:formatCurrency(totalUnpaid+totalOverdue), icon:"pending_actions", style:"text-amber-600"},
              ].map(s=>(
                <div key={s.label} className="flex items-center gap-3 p-4 bg-surface-container-low rounded-xl">
                  <span className={`material-symbols-outlined ${s.style} text-[22px]`}>{s.icon}</span>
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-wide text-on-surface-variant">{s.label}</p>
                    <p className={`text-lg font-extrabold ${s.style}`}>{s.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════ BILLS & PAYMENTS ══════════════════════════════ */}
      {activeTab==="Bills & Payments" && (
        <div className="space-y-6">
          {/* Summary strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {label:"Total", value:formatCurrency(totalBilled), count:`${bills.length} bills`, dot:"bg-slate-400", text:"text-on-surface"},
              {label:"Paid",  value:formatCurrency(totalPaid),   count:`${bills.filter(b=>b.status==="paid").length} done`,   dot:"bg-emerald-500", text:"text-emerald-700"},
              {label:"Unpaid",value:formatCurrency(totalUnpaid), count:`${bills.filter(b=>b.status==="unpaid").length} left`, dot:"bg-amber-400",   text:"text-amber-700"},
              {label:"Overdue",value:formatCurrency(totalOverdue),count:`${bills.filter(b=>b.status==="overdue").length} urgent`,dot:"bg-red-500", text:"text-red-700"},
            ].map(s=>(
              <div key={s.label} className="bg-surface-container-lowest rounded-xl p-5 shadow-card">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-2 h-2 rounded-full ${s.dot}`}/>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">{s.label}</span>
                </div>
                <p className={`text-2xl font-extrabold tracking-tight ${s.text}`}>{s.value}</p>
                <p className="text-[11px] font-bold text-on-surface-variant mt-1">{s.count}</p>
              </div>
            ))}
          </div>

          {/* Cash-in-hand callout */}
          <div className={`flex items-center gap-4 p-5 rounded-2xl border ${cashInHand>=0?"bg-emerald-50 border-emerald-100":"bg-red-50 border-red-100"}`}>
            <span className={`material-symbols-outlined text-[32px] ${cashInHand>=0?"text-emerald-500":"text-red-500"}`}>account_balance_wallet</span>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-widest text-on-surface-variant">Estimated Cash in Hand after all payments</p>
              <p className={`text-3xl font-extrabold tracking-tight mt-0.5 ${cashInHand>=0?"text-emerald-700":"text-red-700"}`}>{formatCurrency(cashInHand)}</p>
            </div>
            <p className="ml-auto text-xs font-medium text-on-surface-variant hidden sm:block text-right">
              Monthly profit<br/>minus unpaid & overdue
            </p>
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-2 flex-wrap flex-1">
              {(["all","paid","unpaid","overdue"] as const).map(f=>(
                <button key={f} onClick={()=>setBillFilter(f)}
                  className={`px-4 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wide transition-all ${
                    billFilter===f ? "cta-gradient text-white shadow-card" : "bg-surface-container-lowest text-on-surface-variant border border-outline-variant hover:bg-surface-container-low"
                  }`}>
                  {f==="all"?"All Bills":STATUS_STYLE[f].label}
                </button>
              ))}
            </div>
            <button onClick={()=>setShowAddBill(true)}
              className="flex items-center gap-2 px-5 py-2 cta-gradient text-white rounded-xl text-xs font-bold shadow-card hover:opacity-90 active:scale-95 transition-all">
              <span className="material-symbols-outlined text-[16px]">add</span>Add Bill
            </button>
          </div>

          {/* Bills list */}
          <div className="space-y-3">
            {filteredBills.length===0 && (
              <div className="text-center py-12 text-on-surface-variant bg-surface-container-lowest rounded-xl shadow-card">
                <span className="material-symbols-outlined text-[40px] text-slate-300 block mb-2">receipt_long</span>
                <p className="font-bold text-sm">{billFilter==="all"?"No bills yet — add one above":"No bills with this status"}</p>
              </div>
            )}
            {filteredBills.map(bill=>{
              const st = STATUS_STYLE[bill.status];
              const isPaid = bill.status==="paid";
              return (
                <div key={bill.id} className={`bg-surface-container-lowest rounded-xl p-5 shadow-card flex items-center gap-4 transition-all duration-200 group ${isPaid?"opacity-70":""}`}>
                  {/* Checkbox */}
                  <button onClick={()=>handleTogglePaid(bill)}
                    className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200 active:scale-90 ${
                      isPaid ? "cta-gradient border-transparent" : "border-outline-variant hover:border-primary-container bg-white"
                    }`}>
                    {isPaid&&<span className="material-symbols-outlined text-white text-[16px] material-symbols-filled">check</span>}
                  </button>
                  {/* Icon */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    bill.status==="overdue"?"bg-red-50":isPaid?"bg-emerald-50":"bg-surface-container-low"}`}>
                    <span className={`material-symbols-outlined text-[20px] ${
                      bill.status==="overdue"?"text-red-500":isPaid?"text-emerald-600":"text-primary-container"}`}>{bill.icon}</span>
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`text-sm font-extrabold ${isPaid?"line-through text-on-surface-variant":"text-on-surface"}`}>{bill.label}</p>
                      {bill.recurring&&<span className="text-[9px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container">Monthly</span>}
                    </div>
                    <p className="text-xs font-medium text-on-surface-variant mt-0.5">
                      Due: {bill.dueDate}
                      {bill.paidDate&&<span className="ml-3 text-emerald-600 font-bold">✓ Paid {bill.paidDate}</span>}
                    </p>
                  </div>
                  {/* Amount + status + delete */}
                  <div className="text-right flex-shrink-0 flex items-center gap-3">
                    <div>
                      <p className={`text-base font-extrabold ${isPaid?"text-emerald-700":bill.status==="overdue"?"text-red-700":"text-on-surface"}`}>
                        {formatCurrency(bill.amount)}
                      </p>
                      <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${st.chip}`}>{st.label}</span>
                    </div>
                    <button onClick={()=>handleDeleteBill(bill.id)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════════ SALES LEDGER ══════════════════════════════════ */}
      {activeTab==="Sales Ledger" && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            {[
              {label:"Revenue (30 days)", value:formatCurrency(totalRevenue),      icon:"point_of_sale", style:"text-blue-600",         bg:"bg-blue-50"},
              {label:"Profit (30 days)",  value:formatCurrency(totalSalesProfit),  icon:"savings",       style:"text-emerald-600",      bg:"bg-emerald-50"},
              {label:"Avg. Margin",       value:totalRevenue>0?`${((totalSalesProfit/totalRevenue)*100).toFixed(1)}%`:"—", icon:"percent", style:"text-primary-container", bg:"bg-cyan-50"},
            ].map(k=>(
              <div key={k.label} className="bg-surface-container-lowest rounded-xl p-5 shadow-card flex items-center gap-4">
                <div className={`w-10 h-10 ${k.bg} rounded-xl flex items-center justify-center`}>
                  <span className={`material-symbols-outlined ${k.style} text-[22px]`}>{k.icon}</span>
                </div>
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">{k.label}</p>
                  <p className={`text-xl font-extrabold tracking-tight ${k.style}`}>{k.value}</p>
                </div>
              </div>
            ))}
          </div>

          {categoryTotals.length>0 && (
            <div className="bg-surface-container-lowest rounded-xl p-6 shadow-card">
              <p className="text-base font-extrabold text-on-surface mb-5">Revenue by Category</p>
              <ResponsiveContainer width="100%" height={Math.max(160, categoryTotals.length*36)}>
                <BarChart data={categoryTotals} layout="vertical" barSize={14}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false}/>
                  <XAxis type="number" tick={{fontSize:10,fill:"#bec8cb"}} axisLine={false} tickLine={false} tickFormatter={v=>`₹${(v/1000).toFixed(0)}k`}/>
                  <YAxis type="category" dataKey="name" tick={{fontSize:11,fontWeight:700,fill:"#3f484b"}} axisLine={false} tickLine={false} width={130}/>
                  <Tooltip formatter={(v)=>[formatCurrency(Number(v)),""]} contentStyle={{fontFamily:"Manrope",fontSize:11,fontWeight:700,borderRadius:10,border:"none",boxShadow:"0 4px 16px rgba(0,0,0,0.08)"}}/>
                  <Bar dataKey="value" name="Revenue" fill="#006778" radius={[0,6,6,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-extrabold uppercase tracking-wider text-on-surface-variant">Filter by date:</span>
            {["all",...uniqueDates].map(d=>(
              <button key={d} onClick={()=>setSalesFilter(d)}
                className={`px-4 py-1.5 rounded-full text-xs font-extrabold transition-all ${
                  salesFilter===d ? "cta-gradient text-white shadow-card" : "bg-surface-container-lowest text-on-surface-variant border border-outline-variant hover:bg-surface-container-low"
                }`}>
                {d==="all"?"All Days":d}
              </button>
            ))}
          </div>

          <div className="bg-surface-container-lowest rounded-xl shadow-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-surface-container-low">
                  {["Date","Product","Category","Qty","Unit Price","Revenue","Cost","Profit","Margin"].map(h=>(
                    <th key={h} className="text-left px-4 py-3.5 text-[10px] font-extrabold uppercase tracking-[0.15em] text-on-surface-variant first:pl-6 last:pr-6">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredSales.map((tx,idx)=>{
                  const margin=((tx.profit/tx.totalRevenue)*100).toFixed(1);
                  return (
                    <tr key={tx.id} className={`border-b border-surface-container hover:bg-surface-container-low transition-colors ${idx%2===1?"":""}`}>
                      <td className="px-6 py-3.5 text-xs font-bold text-on-surface-variant whitespace-nowrap">{tx.date}</td>
                      <td className="px-4 py-3.5 text-sm font-bold text-on-surface max-w-[180px]"><p className="truncate">{tx.productName}</p></td>
                      <td className="px-4 py-3.5"><span className="text-[10px] font-bold bg-surface-container text-on-surface-variant px-2.5 py-1 rounded-full whitespace-nowrap">{tx.category}</span></td>
                      <td className="px-4 py-3.5 text-sm font-bold text-on-surface">{tx.qty}</td>
                      <td className="px-4 py-3.5 text-sm font-bold text-on-surface-variant">{formatCurrency(tx.unitPrice)}</td>
                      <td className="px-4 py-3.5 text-sm font-extrabold text-blue-700">{formatCurrency(tx.totalRevenue)}</td>
                      <td className="px-4 py-3.5 text-sm font-bold text-on-surface-variant">{formatCurrency(tx.totalCost)}</td>
                      <td className="px-4 py-3.5 text-sm font-extrabold text-emerald-700">{formatCurrency(tx.profit)}</td>
                      <td className="px-6 py-3.5">
                        <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full ${Number(margin)>=20?"bg-emerald-50 text-emerald-700":Number(margin)>=10?"bg-amber-50 text-amber-700":"bg-red-50 text-red-700"}`}>{margin}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredSales.length===0&&(
              <div className="text-center py-12 text-on-surface-variant">
                <span className="material-symbols-outlined text-[40px] text-slate-300 block mb-2">receipt_long</span>
                <p className="font-bold text-sm">No transactions found</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════ ADD BILL MODAL ════════════════════════════════ */}
      {showAddBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-ambient w-full max-w-md p-7 space-y-5 animate-fade-in-up">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-extrabold text-on-surface tracking-tight">Add New Bill</h2>
              <button onClick={()=>setShowAddBill(false)} className="p-1.5 hover:bg-surface-container rounded-lg transition-all">
                <span className="material-symbols-outlined text-[20px] text-on-surface-variant">close</span>
              </button>
            </div>

            {[
              {key:"label",   label:"Bill Name *",   placeholder:"e.g. Water Bill", type:"text"},
              {key:"amount",  label:"Amount (₹) *",  placeholder:"e.g. 500",        type:"number"},
              {key:"dueDate", label:"Due Date *",     placeholder:"",                type:"date"},
            ].map(f=>(
              <div key={f.key}>
                <label className="text-xs font-extrabold uppercase tracking-wider text-on-surface-variant block mb-1.5">{f.label}</label>
                <input type={f.type} placeholder={f.placeholder}
                  value={newBill[f.key as keyof typeof newBill] as string}
                  onChange={e=>setNewBill(p=>({...p,[f.key]:e.target.value}))}
                  className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary-container/30 placeholder:text-slate-400 transition-all"/>
              </div>
            ))}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-extrabold uppercase tracking-wider text-on-surface-variant block mb-1.5">Category</label>
                <select value={newBill.category} onChange={e=>setNewBill(p=>({...p,category:e.target.value,icon:
                  e.target.value==="rent"?"home":e.target.value==="electricity"?"bolt":e.target.value==="salaries"?"group":
                  e.target.value==="internet"?"wifi":e.target.value==="supplies"?"local_shipping":
                  e.target.value==="maintenance"?"construction":"receipt_long"
                }))}
                  className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-primary-container/30 text-on-surface">
                  {["rent","electricity","salaries","internet","supplies","maintenance","other"].map(c=>(
                    <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-3 cursor-pointer">
                  <button type="button" onClick={()=>setNewBill(p=>({...p,recurring:!p.recurring}))}
                    className={`w-10 h-6 rounded-full transition-all duration-200 relative flex-shrink-0 ${newBill.recurring?"cta-gradient":"bg-surface-container-high"}`}>
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${newBill.recurring?"left-5":"left-1"}`}/>
                  </button>
                  <span className="text-xs font-bold text-on-surface-variant">Recurring monthly</span>
                </label>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={()=>setShowAddBill(false)}
                className="flex-1 py-3 rounded-xl font-bold text-sm text-on-surface-variant bg-surface-container hover:bg-surface-container-high transition-all">
                Cancel
              </button>
              <button onClick={handleAddBill} disabled={addingBill||!newBill.label||!newBill.amount||!newBill.dueDate}
                className="flex-1 py-3 rounded-xl font-bold text-sm cta-gradient text-white shadow-card hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50">
                {addingBill?"Saving…":"Add Bill"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
