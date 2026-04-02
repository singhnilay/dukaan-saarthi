"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [googleLoading, setGoogleLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setAuthError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      },
    });
    if (error) {
      console.error("Google sign-in failed:", error.message);
      setAuthError(error.message);
      setGoogleLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col md:flex-row overflow-hidden bg-surface">
      {/* Left: Brand Story Panel */}
      <section className="hidden md:flex md:w-7/12 bg-surface-container-low relative flex-col justify-center px-16 xl:px-24">
        <div className="absolute top-10 left-10 flex items-center gap-3">
          <div className="w-10 h-10 cta-gradient rounded-xl flex items-center justify-center text-white shadow-card">
            <span className="material-symbols-outlined material-symbols-filled text-[20px]">storefront</span>
          </div>
          <span className="font-extrabold text-xl text-primary tracking-tighter">Dukaan Bright</span>
        </div>

        <div className="space-y-6 z-10 max-w-xl animate-fade-in-up">
          <h1 className="font-extrabold text-5xl lg:text-6xl text-on-surface leading-tight tracking-tight">
            Smart dukaan,<br />
            <span className="text-primary-container">zyada munafa</span>
          </h1>
          <p className="text-on-surface-variant text-lg font-medium leading-relaxed max-w-md">
            AI-powered inventory management for kirana stores. Track stock, prevent expiry losses, and optimize your prices automatically.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            {[
              { icon: "inventory_2", label: "Smart Inventory" },
              { icon: "trending_up", label: "AI Pricing" },
              { icon: "alarm",       label: "Expiry Alerts" },
              { icon: "bar_chart",   label: "Profit Insights" },
            ].map((f) => (
              <div key={f.label} className="flex items-center gap-2 bg-white/70 backdrop-blur-sm px-4 py-2 rounded-full shadow-card border border-gray-100">
                <span className="material-symbols-outlined text-primary-container text-[16px]">{f.icon}</span>
                <span className="text-xs font-bold text-on-surface">{f.label}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 pt-4">
            <div className="flex -space-x-2">
              {["RK","PM","SJ","AT"].map((i) => (
                <div key={i} className="w-8 h-8 rounded-full cta-gradient border-2 border-white flex items-center justify-center text-white text-[10px] font-bold">{i}</div>
              ))}
            </div>
            <p className="text-sm text-on-surface-variant font-medium">
              <span className="font-extrabold text-on-surface">2,400+</span> shop owners trust Dukaan Bright
            </p>
          </div>
        </div>

        <div className="absolute bottom-0 right-0 w-96 h-96 bg-primary-container/10 rounded-full blur-3xl -translate-x-1/4 translate-y-1/4 pointer-events-none" />
        <div className="absolute top-1/3 right-0 w-64 h-64 bg-secondary-container/30 rounded-full blur-2xl pointer-events-none" />
      </section>

      {/* Right: Auth Panel */}
      <section className="flex-1 flex items-center justify-center px-8 py-16 bg-surface">
        <div className="w-full max-w-sm space-y-8 animate-fade-in-up animate-delay-100">
          <div className="md:hidden flex items-center gap-3 mb-6">
            <div className="w-10 h-10 cta-gradient rounded-xl flex items-center justify-center text-white">
              <span className="material-symbols-outlined material-symbols-filled text-[20px]">storefront</span>
            </div>
            <span className="font-extrabold text-xl text-primary">Dukaan Bright</span>
          </div>

          <div>
            <h2 className="text-3xl font-extrabold text-on-surface tracking-tight">Welcome back</h2>
            <p className="mt-2 text-sm font-medium text-on-surface-variant">Sign in to manage your shop</p>
          </div>

          {/* Error message */}
          {authError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs font-bold text-red-700">
              <span className="material-symbols-outlined text-[16px]">error</span>
              {authError}
            </div>
          )}

          {/* Google Sign In */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 py-3.5 px-6 bg-surface-container-lowest border border-outline-variant rounded-xl font-bold text-sm text-on-surface hover:bg-surface-container-low transition-all duration-200 shadow-card hover:shadow-card-hover active:scale-[0.98] disabled:opacity-60"
          >
            {googleLoading ? (
              <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            {googleLoading ? "Redirecting…" : "Continue with Google"}
          </button>

          <p className="text-xs text-center text-on-surface-variant font-medium">
            New to Dukaan Bright?{" "}
            <Link href="/register" className="text-primary-container font-bold hover:underline">Create account</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
