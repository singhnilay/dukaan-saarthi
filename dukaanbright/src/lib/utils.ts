import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-IN").format(n);
}

export function getStockStatusColor(status: string): string {
  switch (status) {
    case "healthy": return "text-emerald-700 bg-emerald-50";
    case "low": return "text-amber-700 bg-amber-50";
    case "critical": return "text-red-700 bg-red-50";
    case "expired": return "text-gray-600 bg-gray-100";
    default: return "text-gray-600 bg-gray-100";
  }
}

export function getStockDotColor(status: string): string {
  switch (status) {
    case "healthy": return "bg-emerald-500";
    case "low": return "bg-amber-400";
    case "critical": return "bg-red-500";
    case "expired": return "bg-gray-400";
    default: return "bg-gray-400";
  }
}

export function getPriorityColor(priority: string): string {
  switch (priority) {
    case "high": return "text-red-700 bg-red-50 border-red-100";
    case "medium": return "text-amber-700 bg-amber-50 border-amber-100";
    case "low": return "text-emerald-700 bg-emerald-50 border-emerald-100";
    default: return "text-gray-600 bg-gray-50 border-gray-100";
  }
}

export function getInsightIcon(type: string): string {
  switch (type) {
    case "price_increase": return "trending_up";
    case "price_decrease": return "trending_down";
    case "restock": return "inventory_2";
    case "clearance": return "local_offer";
    case "trending": return "bar_chart";
    default: return "tips_and_updates";
  }
}

export function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
