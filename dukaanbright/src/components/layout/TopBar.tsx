"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const pageMeta: Record<string, { title: string; subtitle: string }> = {
  "/dashboard":   { title: "Dashboard",    subtitle: "Overview of your shop today" },
  "/inventory":   { title: "Inventory",    subtitle: "Manage products and stock levels" },
  "/add-sale":    { title: "Add Sale",     subtitle: "Record sales and update revenue" },
  "/insights":    { title: "AI Insights",  subtitle: "Smart recommendations to boost profit" },
  "/add-product": { title: "Add Product",  subtitle: "Add new items to your inventory" },
  "/settings":    { title: "Settings",     subtitle: "Configure your shop preferences" },
};

export default function TopBar() {
  const pathname = usePathname();
  const meta = pageMeta[pathname] ?? { title: "Dukaan Bright", subtitle: "" };
  const [focused, setFocused] = useState(false);
  const [ownerName, setOwnerName] = useState("Shop Owner");
  const [initials, setInitials] = useState("SO");

  useEffect(() => {
    const loadProfile = async () => {
      const supabase = createClient();

      const load = async () => {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData.user;
        if (!user) return;

        const { data: profile } = await supabase
          .from("users")
          .select("full_name")
          .eq("id", user.id)
          .maybeSingle();

        const name =
          profile?.full_name ||
          (user.user_metadata?.full_name as string | undefined) ||
          user.email ||
          "Shop Owner";

        setOwnerName(name);

        const parts = name
          .split(" ")
          .filter((part: string) => Boolean(part))
          .slice(0, 2);
        const inits =
          parts.length === 0
            ? "SO"
            : parts
                .map((p: string) => p[0]?.toUpperCase() ?? "")
                .join("") || "SO";
        setInitials(inits);
      };

      try {
        await load();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("lock")) {
          await new Promise((resolve) => setTimeout(resolve, 150));
          try {
            await load();
            return;
          } catch (retryError) {
            console.error("Failed to load owner profile for TopBar after retry:", retryError);
            return;
          }
        }
        console.error("Failed to load owner profile for TopBar:", error);
      }
    };

    void loadProfile();
  }, []);

  return (
    <header className="flex justify-between items-center w-full px-8 h-16 sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
      <div className="flex items-center gap-6">
        <div>
          <h1 className="text-lg font-extrabold text-on-surface tracking-tight leading-tight">{meta.title}</h1>
          <p className="text-[11px] font-medium text-on-surface-variant leading-tight">{meta.subtitle}</p>
        </div>
        <div className={`hidden md:flex items-center px-4 py-2 rounded-full w-72 transition-all duration-200 ${
          focused
            ? "bg-white ring-2 ring-primary-container/30 shadow-card"
            : "bg-surface-container-low"
        }`}>
          <span className="material-symbols-outlined text-slate-400 text-[18px] mr-2 flex-shrink-0">search</span>
          <input
            className="bg-transparent border-none outline-none text-sm w-full font-medium placeholder:text-slate-400"
            placeholder="Search products..."
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button className="relative p-2 text-slate-500 hover:bg-surface-container-low rounded-full transition-all active:scale-95">
          <span className="material-symbols-outlined text-[22px]">notifications</span>
          <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 bg-error rounded-full ring-2 ring-white" />
        </button>
        <button className="p-2 text-slate-500 hover:bg-surface-container-low rounded-full transition-all active:scale-95">
          <span className="material-symbols-outlined text-[22px]">help_outline</span>
        </button>
        <Link
          href="/settings"
          className="flex items-center gap-2.5 pl-3 ml-1 border-l border-gray-100 hover:opacity-80 transition-opacity"
        >
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
