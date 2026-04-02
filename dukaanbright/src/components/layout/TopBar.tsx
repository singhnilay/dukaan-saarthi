"use client";
import { usePathname } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import SearchBar from "./SearchBar";

const pageMeta: Record<string, { title: string; subtitle: string }> = {
  "/dashboard":   { title: "Dashboard",    subtitle: "Overview of your shop today" },
  "/inventory":   { title: "Inventory",    subtitle: "Manage products and stock levels" },
  "/add-sale":    { title: "Add Sale",     subtitle: "Record sales and update revenue" },
  "/insights":    { title: "AI Insights",  subtitle: "Smart recommendations to boost profit" },
  "/add-product": { title: "Add Product",  subtitle: "Add new items to your inventory" },
  "/finances":    { title: "Finances",     subtitle: "Bills, sales ledger & cash flow" },
  "/settings":    { title: "Settings",     subtitle: "Configure your shop preferences" },
  "/edit-product":{ title: "Edit Product", subtitle: "Update product details" },
};

export default function TopBar() {
  const pathname = usePathname();
  const meta = pageMeta[pathname] ?? { title: "Dukaan Bright", subtitle: "" };
  const [ownerName, setOwnerName] = useState("Shop Owner");
  const [initials, setInitials]   = useState("SO");

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: profile } = await supabase
          .from("users").select("full_name").eq("id", user.id).maybeSingle();
        const name =
          profile?.full_name ||
          (user.user_metadata?.full_name as string | undefined) ||
          user.email || "Shop Owner";
        setOwnerName(name);
        const parts = name.split(" ").filter(Boolean).slice(0, 2);
        setInitials(parts.map((p: string) => p[0]?.toUpperCase() ?? "").join("") || "SO");
      } catch { /* ignore */ }
    };
    void load();
  }, []);

  return (
    <header className="flex justify-between items-center w-full px-8 h-16 sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
      <div className="flex items-center gap-6">
        <div>
          <h1 className="text-lg font-extrabold text-on-surface tracking-tight leading-tight">{meta.title}</h1>
          <p className="text-[11px] font-medium text-on-surface-variant leading-tight">{meta.subtitle}</p>
        </div>
        {/* SearchBar isolated in its own Suspense so useSearchParams doesn't block prerender */}
        <Suspense fallback={<div className="hidden md:block w-72 h-9 bg-surface-container-low rounded-full animate-pulse" />}>
          <SearchBar />
        </Suspense>
      </div>

      <div className="flex items-center gap-1">
        <button className="relative p-2 text-slate-500 hover:bg-surface-container-low rounded-full transition-all active:scale-95">
          <span className="material-symbols-outlined text-[22px]">notifications</span>
          <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 bg-error rounded-full ring-2 ring-white" />
        </button>
        <button className="p-2 text-slate-500 hover:bg-surface-container-low rounded-full transition-all active:scale-95">
          <span className="material-symbols-outlined text-[22px]">help_outline</span>
        </button>
        <Link href="/settings" className="flex items-center gap-2.5 pl-3 ml-1 border-l border-gray-100 hover:opacity-80 transition-opacity">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-extrabold text-on-surface tracking-tight">{ownerName}</p>
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Shop Owner</p>
          </div>
          <div className="w-9 h-9 rounded-full cta-gradient flex items-center justify-center text-white text-xs font-extrabold shadow-card">
            {initials}
          </div>
        </Link>
      </div>
    </header>
  );
}
