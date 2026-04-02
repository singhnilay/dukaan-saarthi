"use client";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useState, useEffect } from "react";

export default function SearchBar() {
  const pathname   = usePathname();
  const router     = useRouter();
  const params     = useSearchParams();
  const [query, setQuery]   = useState("");
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (pathname === "/inventory") {
      setQuery(params.get("search") ?? "");
    } else {
      setQuery("");
    }
  }, [pathname, params]);

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const q = query.trim();
    if (q) router.push(`/inventory?search=${encodeURIComponent(q)}`);
    else if (pathname === "/inventory") router.push("/inventory");
  };

  return (
    <div className={`hidden md:flex items-center px-4 py-2 rounded-full w-72 transition-all duration-200 ${
      focused ? "bg-white ring-2 ring-primary-container/30 shadow-card" : "bg-surface-container-low"
    }`}>
      <span className="material-symbols-outlined text-slate-400 text-[18px] mr-2 flex-shrink-0">search</span>
      <input
        className="bg-transparent border-none outline-none text-sm w-full font-medium placeholder:text-slate-400"
        placeholder="Search products..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKey}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </div>
  );
}
