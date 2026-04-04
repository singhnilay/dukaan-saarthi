"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveUserShop } from "@/lib/supabase/shopResolver";

type QueryResponse = {
  answer?: string;
  error?: string;
  usedToday?: number;
  remaining?: number;
  limit?: number;
};

export default function QueryPage() {
  const devBypassAuth = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "1";
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shopId, setShopId] = useState<string>("");
  const [usedToday, setUsedToday] = useState<number>(0);
  const [remaining, setRemaining] = useState<number>(10);

  useEffect(() => {
    const bootstrap = async () => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      if (user) {
        const shop = await resolveUserShop(supabase, user.id, "id");
        if (typeof shop?.id === "string") {
          setShopId(shop.id);
          return;
        }
      }

      if (devBypassAuth) {
        const { data: firstShop } = await supabase
          .from("shops")
          .select("id")
          .order("created_at", { ascending: true })
          .maybeSingle();

        if (firstShop?.id) {
          setShopId(String(firstShop.id));
          return;
        }
      }

      setError("Shop not found. Please complete onboarding.");
    };

    void bootstrap();
  }, [devBypassAuth]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setAnswer("");

    const trimmed = question.trim();
    if (!trimmed) {
      setError("Please enter a query.");
      return;
    }

    if (!shopId) {
      setError("Shop not found. Please complete onboarding.");
      return;
    }

    try {
      setLoading(true);
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 22000);

      const res = await fetch("/api/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          query: trimmed,
          shopId,
        }),
        signal: controller.signal,
      }).finally(() => {
        clearTimeout(timeoutId);
      });

      const payload = (await res.json()) as QueryResponse;

      if (!res.ok) {
        setError(payload.error ?? "Request failed");
        if (typeof payload.usedToday === "number") setUsedToday(payload.usedToday);
        if (typeof payload.remaining === "number") setRemaining(payload.remaining);
        return;
      }

      setAnswer(payload.answer ?? "");
      if (typeof payload.usedToday === "number") setUsedToday(payload.usedToday);
      if (typeof payload.remaining === "number") setRemaining(payload.remaining);
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setError("Request timed out. Please try a shorter query.");
      } else {
        setError("Failed to process query.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-r from-[#0f766e] to-[#164e63] text-white p-6 shadow-card">
        <p className="text-xs font-extrabold uppercase tracking-[0.25em] text-white/70">NVIDIA Query Tab</p>
        <h1 className="text-3xl font-extrabold mt-2">Ask your shop query</h1>
        <p className="text-sm text-white/85 mt-2">Free tier limit: 10 queries per day.</p>
      </div>

      <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-card border border-outline/20 space-y-4">
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block text-sm font-bold text-on-surface">Your query</label>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={5}
            placeholder="Type your question..."
            className="w-full rounded-xl border border-outline/30 bg-surface px-4 py-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container"
          />

          <div className="flex items-center justify-between gap-4">
            <p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">
              Used today: {usedToday} / 10 | Remaining: {remaining}
            </p>
            <button
              type="submit"
              disabled={loading}
              className={`px-5 py-2.5 rounded-xl text-sm font-extrabold transition-all ${
                loading
                  ? "bg-surface-container text-on-surface-variant cursor-default"
                  : "cta-gradient text-white hover:opacity-90"
              }`}
            >
              {loading ? "Asking..." : "Ask AI"}
            </button>
          </div>
        </form>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        {answer && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-extrabold uppercase tracking-wide text-emerald-700 mb-2">Answer</p>
            <p className="text-sm font-medium text-emerald-900 whitespace-pre-wrap">{answer}</p>
          </div>
        )}
      </div>
    </div>
  );
}