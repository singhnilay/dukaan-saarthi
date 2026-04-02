"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";

type ProductOption = {
  id: string;
  name: string;
  quantity: number;
  costPrice: number;
  sellingPrice: number;
};

export default function AddSalePage() {
  const router = useRouter();
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [form, setForm] = useState({
    productId: "",
    quantitySold: "1",
    sellingPrice: "",
    soldAt: new Date().toISOString().slice(0, 10),
    note: "",
  });

  useEffect(() => {
    const loadProducts = async () => {
      try {
        setLoadingProducts(true);
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        const user = userData.user;
        if (!user) {
          router.push("/login?error=auth_required");
          return;
        }

        const { data: shop } = await supabase
          .from("shops")
          .select("id")
          .eq("owner_user_id", user.id)
          .order("created_at", { ascending: true })
          .maybeSingle();
        if (!shop) {
          setErrorMsg("Shop setup not found. Please complete onboarding first.");
          return;
        }

        const { data: rows } = await supabase
          .from("products")
          .select("id, name, quantity, cost_price, selling_price")
          .eq("shop_id", shop.id)
          .order("name", { ascending: true });

        const mapped = (rows ?? []).map((p: any) => ({
          id: String(p.id),
          name: p.name ?? "Unnamed Product",
          quantity: Number(p.quantity ?? 0),
          costPrice: Number(p.cost_price ?? 0),
          sellingPrice: Number(p.selling_price ?? 0),
        }));
        setProducts(mapped);
      } catch (e) {
        console.error("Failed to load products for sale:", e);
        setErrorMsg("Could not load products. Please refresh.");
      } finally {
        setLoadingProducts(false);
      }
    };

    void loadProducts();
  }, [router]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === form.productId),
    [products, form.productId]
  );

  useEffect(() => {
    if (selectedProduct) {
      setForm((prev) => ({
        ...prev,
        sellingPrice:
          prev.sellingPrice || String(selectedProduct.sellingPrice || 0),
      }));
    }
  }, [selectedProduct]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSubmitting(true);

    try {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        router.push("/login?error=auth_required");
        return;
      }

      const { data: shop } = await supabase
        .from("shops")
        .select("id")
        .eq("owner_user_id", user.id)
        .order("created_at", { ascending: true })
        .maybeSingle();
      if (!shop) {
        setErrorMsg("Shop setup not found. Please complete onboarding first.");
        return;
      }

      if (!selectedProduct) {
        setErrorMsg("Please select a product.");
        return;
      }

      const qtySold = Math.max(1, Number(form.quantitySold || 0));
      if (qtySold > selectedProduct.quantity) {
        setErrorMsg("Quantity sold cannot exceed available stock.");
        return;
      }

      const salePrice = Number(form.sellingPrice || selectedProduct.sellingPrice || 0);
      const revenue = salePrice * qtySold;
      const grossProfit = (salePrice - selectedProduct.costPrice) * qtySold;
      const newQty = selectedProduct.quantity - qtySold;

      const status =
        newQty <= 0
          ? "critical"
          : newQty <= 2
            ? "low"
            : "healthy";

      const soldAtDate = form.soldAt || new Date().toISOString().slice(0, 10);
      const soldAtIso = `${soldAtDate}T12:00:00.000Z`;

      const { error: movementError } = await supabase.from("inventory_movements").insert({
        shop_id: shop.id,
        product_id: selectedProduct.id,
        type: "sale",
        qty_delta: -qtySold,
        unit_price: salePrice,
        unit_cost: selectedProduct.costPrice,
        note: form.note || null,
        occurred_at: soldAtIso,
      });
      if (movementError) throw movementError;

      const { error: productUpdateError } = await supabase
        .from("products")
        .update({
          quantity: newQty,
          status,
        })
        .eq("id", selectedProduct.id);
      if (productUpdateError) throw productUpdateError;

      const { data: existingMetric } = await supabase
        .from("daily_shop_metrics")
        .select("id, revenue, gross_profit, net_profit")
        .eq("shop_id", shop.id)
        .eq("day", soldAtDate)
        .maybeSingle();

      if (existingMetric?.id) {
        const { error: metricUpdateError } = await supabase
          .from("daily_shop_metrics")
          .update({
            revenue: Number(existingMetric.revenue ?? 0) + revenue,
            gross_profit: Number(existingMetric.gross_profit ?? 0) + grossProfit,
            net_profit: Number(existingMetric.net_profit ?? 0) + grossProfit,
          })
          .eq("id", existingMetric.id);
        if (metricUpdateError) throw metricUpdateError;
      } else {
        const { error: metricInsertError } = await supabase
          .from("daily_shop_metrics")
          .insert({
            shop_id: shop.id,
            day: soldAtDate,
            revenue,
            gross_profit: grossProfit,
            net_profit: grossProfit,
            low_stock_count: 0,
            expiring_count: 0,
          });
        if (metricInsertError) throw metricInsertError;
      }

      setSaved(true);
      setTimeout(() => router.push("/inventory"), 800);
    } catch (error) {
      console.error("Failed to record sale:", error);
      setErrorMsg("Could not record sale. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const estimatedRevenue = selectedProduct
    ? Number(form.quantitySold || 0) * Number(form.sellingPrice || selectedProduct.sellingPrice || 0)
    : 0;

  return (
    <div className="max-w-3xl space-y-8 animate-fade-in-up">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight text-on-surface">Add Sale</h1>
        <p className="text-on-surface-variant mt-1 font-medium">
          Record sold items to keep inventory and revenue accurate
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-surface-container-lowest rounded-xl p-7 shadow-card space-y-6">
        {errorMsg && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {errorMsg}
          </div>
        )}

        <div className="grid grid-cols-2 gap-5">
          <div>
            <label className="text-xs font-extrabold uppercase tracking-wider text-on-surface-variant block mb-2">
              Product *
            </label>
            <select
              required
              value={form.productId}
              onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value }))}
              className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary-container/30 transition-all text-on-surface"
              disabled={loadingProducts}
            >
              <option value="">{loadingProducts ? "Loading products..." : "Select product..."}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (stock: {p.quantity})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-extrabold uppercase tracking-wider text-on-surface-variant block mb-2">
              Sale Date *
            </label>
            <input
              type="date"
              required
              value={form.soldAt}
              onChange={(e) => setForm((f) => ({ ...f, soldAt: e.target.value }))}
              className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary-container/30 transition-all"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-5">
          <div>
            <label className="text-xs font-extrabold uppercase tracking-wider text-on-surface-variant block mb-2">
              Quantity Sold *
            </label>
            <input
              type="number"
              min="1"
              required
              value={form.quantitySold}
              onChange={(e) => setForm((f) => ({ ...f, quantitySold: e.target.value }))}
              className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary-container/30 transition-all"
            />
          </div>

          <div>
            <label className="text-xs font-extrabold uppercase tracking-wider text-on-surface-variant block mb-2">
              Selling Price per Unit (₹) *
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={form.sellingPrice}
              onChange={(e) => setForm((f) => ({ ...f, sellingPrice: e.target.value }))}
              className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary-container/30 transition-all"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-extrabold uppercase tracking-wider text-on-surface-variant block mb-2">
            Note (optional)
          </label>
          <input
            type="text"
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="e.g. weekend counter sale"
            className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary-container/30 transition-all"
          />
        </div>

        <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3">
          <p className="text-xs font-extrabold uppercase tracking-wider text-emerald-700">Estimated Revenue</p>
          <p className="text-2xl font-extrabold text-emerald-700">{formatCurrency(estimatedRevenue)}</p>
        </div>

        <div className="flex gap-4 pt-2">
          <button
            type="submit"
            disabled={submitting || loadingProducts}
            className={`flex-1 py-3.5 rounded-xl font-bold text-sm transition-all active:scale-[0.98] shadow-card ${
              saved ? "bg-emerald-500 text-white" : "cta-gradient text-white hover:opacity-90"
            }`}
          >
            {saved ? "✓ Sale Recorded! Redirecting…" : submitting ? "Saving..." : "Record Sale"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/inventory")}
            className="px-6 py-3.5 rounded-xl font-bold text-sm text-on-surface-variant bg-surface-container hover:bg-surface-container-high transition-all"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
