export type StockStatus = "healthy" | "low" | "critical" | "expired";
export type AlertLevel = "red" | "yellow" | "green";

export interface Product {
  id: string;
  name: string;
  barcode?: string;
  category: string;
  quantity: number;
  minQuantity: number;
  costPrice: number;
  sellingPrice: number;
  expiryDate?: string;
  stockStatus: StockStatus;
  daysToExpiry?: number;
  aiSuggestedPrice?: number;
  trend: "up" | "down" | "stable";
}

export interface Expense {
  id: string;
  label: string;
  amount: number;
  icon: string;
}

export interface DashboardStats {
  todayProfit: number;
  todayRevenue: number;
  monthlyGoal: number;
  monthlyProgress: number;
  totalProducts: number;
  lowStockCount: number;
  expiringCount: number;
  topProduct: string;
}

export interface AIInsight {
  id: string;
  productId: string;
  productName: string;
  type: "price_increase" | "price_decrease" | "restock" | "clearance" | "trending";
  recommendation: string;
  impact: string;
  currentPrice: number;
  suggestedPrice?: number;
  priority: "high" | "medium" | "low";
}

export interface ChartDataPoint {
  day: string;
  revenue: number;
  profit: number;
}

// ── Finances ──────────────────────────────────────────────────────────────────

export type BillStatus = "paid" | "unpaid" | "overdue";
export type BillCategory = "rent" | "electricity" | "salaries" | "supplies" | "internet" | "maintenance" | "other";
export type TxType = "income" | "expense";

export interface Bill {
  id: string;
  label: string;
  category: BillCategory;
  amount: number;
  dueDate: string;         // "YYYY-MM-DD"
  status: BillStatus;
  icon: string;
  recurring: boolean;
  paidDate?: string;
}

export interface SaleTransaction {
  id: string;
  date: string;            // "YYYY-MM-DD"
  productName: string;
  category: string;
  qty: number;
  unitPrice: number;
  totalRevenue: number;
  totalCost: number;
  profit: number;
}

export interface MonthlySummary {
  month: string;           // "Jan", "Feb" …
  revenue: number;
  expenses: number;
  profit: number;
}
