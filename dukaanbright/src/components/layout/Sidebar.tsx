"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Dashboard",  icon: "dashboard",     href: "/dashboard" },
  { label: "Inventory",  icon: "inventory_2",   href: "/inventory" },
  { label: "Finances",   icon: "account_balance",href: "/finances" },
  { label: "AI Insights",icon: "insights",      href: "/insights" },
  { label: "Query",      icon: "forum",         href: "/query" },
  { label: "Add Product",icon: "add_box",        href: "/add-product" },
  { label: "Settings",   icon: "settings",       href: "/settings" },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="fixed left-0 top-0 h-screen w-64 flex flex-col py-6 z-40 bg-[#f5f7fa] border-r border-gray-100">
      {/* Brand */}
      <div className="px-6 mb-10 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl cta-gradient flex items-center justify-center text-white shadow-card">
          <span className="material-symbols-outlined material-symbols-filled text-[20px]">storefront</span>
        </div>
        <div>
          <h2 className="text-sm font-extrabold text-primary-container leading-tight">Dukaan Bright</h2>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Smart Inventory</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 pr-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link key={item.href} href={item.href}
              className={cn(
                "flex items-center gap-3 px-6 py-3 text-sm font-medium transition-all duration-200",
                isActive
                  ? "nav-active font-extrabold text-primary-container"
                  : "text-slate-600 hover:text-primary-container hover:translate-x-1 rounded-r-full"
              )}>
              <span className={cn("material-symbols-outlined text-[20px]", isActive && "material-symbols-filled")}>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="mt-auto px-6 pr-10">
        <div className="pt-4 border-t border-gray-100">
          <Link href="/login" className="flex items-center gap-3 text-slate-500 hover:text-red-500 py-3 text-sm font-medium transition-colors duration-200">
            <span className="material-symbols-outlined text-[20px]">logout</span>
            <span>Logout</span>
          </Link>
        </div>
      </div>
    </aside>
  );
}
