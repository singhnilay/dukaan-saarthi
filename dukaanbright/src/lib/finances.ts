import { createClient } from "@/lib/supabase/client";
import type { Bill, SaleTransaction, MonthlySummary, Expense } from "@/types";

// ── helpers ───────────────────────────────────────────────────────────────────
function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

async function getShopId(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("shops")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  return data?.id ?? null;
}

// ── expenses ──────────────────────────────────────────────────────────────────
export async function fetchExpenses(): Promise<Expense[]> {
  const supabase = createClient();
  const shopId = await getShopId(supabase);
  if (!shopId) return [];

  const month = firstOfMonth();

  // Get all categories (global defaults + shop-specific)
  const { data: cats } = await supabase
    .from("expense_categories")
    .select("id, category_code as code, label, icon")
    .or(`shop_id.is.null,shop_id.eq.${shopId}`)
    .order("created_at");

  if (!cats?.length) return [];

  const { data: amounts } = await supabase
    .from("shop_monthly_expenses")
    .select("category_id, amount")
    .eq("shop_id", shopId)
    .eq("month", month);

  const amountMap = new Map((amounts ?? []).map((r: any) => [r.category_id, Number(r.amount)]));

  return cats.map((c: any): Expense => ({
    id:     c.id,
    label:  c.label,
    icon:   c.icon ?? "receipt_long",
    amount: amountMap.get(c.id) ?? 0,
  }));
}

export async function saveExpenses(expenses: Expense[]): Promise<void> {
  const supabase = createClient();
  const shopId = await getShopId(supabase);
  if (!shopId) return;
  const month = firstOfMonth();

  const upserts = expenses.map((e) => ({
    shop_id: shopId, category_id: e.id, month, amount: e.amount,
  }));
  await supabase
    .from("shop_monthly_expenses")
    .upsert(upserts, { onConflict: "shop_id,category_id,month" });
}

export async function addExpenseCategory(
  label: string, icon: string, shopId: string
): Promise<Expense | null> {
  const supabase = createClient();
  const code = label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  const { data, error } = await supabase
    .from("expense_categories")
    .insert({ shop_id: shopId, category_code: code, label, icon, is_default: false })
    .select("id, label, icon")
    .single();
  if (error || !data) return null;
  return { id: data.id, label: data.label, icon: data.icon ?? "receipt_long", amount: 0 };
}

export async function deleteExpenseCategory(categoryId: string): Promise<void> {
  const supabase = createClient();
  await supabase.from("expense_categories").delete().eq("id", categoryId);
}

// ── bills ─────────────────────────────────────────────────────────────────────
export async function fetchBills(): Promise<Bill[]> {
  const supabase = createClient();
  const shopId = await getShopId(supabase);
  if (!shopId) return [];

  const { data } = await supabase
    .from("bills")
    .select("*")
    .eq("shop_id", shopId)
    .order("due_date");

  if (!data) return [];

  const today = new Date().toISOString().split("T")[0];
  return data.map((b: any): Bill => ({
    id:        b.id,
    label:     b.label,
    category:  b.category,
    icon:      b.icon ?? "receipt_long",
    amount:    Number(b.amount),
    dueDate:   b.due_date,
    status:    b.status === "paid" ? "paid" : b.due_date < today ? "overdue" : "unpaid",
    recurring: b.recurring ?? false,
    paidDate:  b.paid_date ?? undefined,
  }));
}

export async function toggleBillPaid(bill: Bill): Promise<void> {
  const supabase = createClient();
  const nowPaid = bill.status !== "paid";
  await supabase
    .from("bills")
    .update({
      status:    nowPaid ? "paid" : "unpaid",
      paid_date: nowPaid ? new Date().toISOString().split("T")[0] : null,
    })
    .eq("id", bill.id);
}

export async function addBill(
  shopId: string,
  payload: Omit<Bill, "id" | "status" | "paidDate">
): Promise<Bill | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("bills")
    .insert({
      shop_id:   shopId,
      label:     payload.label,
      category:  payload.category,
      icon:      payload.icon,
      amount:    payload.amount,
      due_date:  payload.dueDate,
      recurring: payload.recurring,
      status:    "unpaid",
    })
    .select("*")
    .single();
  if (error || !data) return null;
  return {
    id: data.id, label: data.label, category: data.category,
    icon: data.icon, amount: Number(data.amount),
    dueDate: data.due_date, status: "unpaid",
    recurring: data.recurring, paidDate: undefined,
  };
}

export async function deleteBill(id: string): Promise<void> {
  const supabase = createClient();
  await supabase.from("bills").delete().eq("id", id);
}

// ── sales ─────────────────────────────────────────────────────────────────────
export async function fetchSales(days = 30): Promise<SaleTransaction[]> {
  const supabase = createClient();
  const shopId = await getShopId(supabase);
  if (!shopId) return [];

  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data } = await supabase
    .from("sale_transactions")
    .select("*")
    .eq("shop_id", shopId)
    .gte("sale_date", since.toISOString().split("T")[0])
    .order("sale_date", { ascending: false });

  return (data ?? []).map((r: any): SaleTransaction => ({
    id:           r.id,
    date:         r.sale_date,
    productName:  r.product_name,
    category:     r.category,
    qty:          r.qty,
    unitPrice:    Number(r.unit_price),
    totalRevenue: Number(r.total_revenue),
    totalCost:    Number(r.total_cost),
    profit:       Number(r.profit),
  }));
}

export async function fetchMonthlySummary(): Promise<MonthlySummary[]> {
  const supabase = createClient();
  const shopId = await getShopId(supabase);
  if (!shopId) return [];

  const { data } = await supabase
    .from("monthly_sales_summary")
    .select("month, revenue, cost, profit")
    .eq("shop_id", shopId)
    .order("month_date")
    .limit(6);

  if (!data?.length) return [];
  return data.map((r: any): MonthlySummary => ({
    month:    r.month,
    revenue:  Number(r.revenue),
    expenses: Number(r.cost),
    profit:   Number(r.profit),
  }));
}

export async function getShopIdPublic(): Promise<string | null> {
  const supabase = createClient();
  return getShopId(supabase);
}
