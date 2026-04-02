"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type EditForm = {
  name: string;
  category: string;
  quantity: string;
  minQuantity: string;
  costPrice: string;
  sellingPrice: string;
  expiryDate: string; // yyyy-mm-dd
};

type CategoryRow = { id: string; name: string };

export default function EditProductPage() {
  const params = useParams();
  const router = useRouter();
  const productId = useMemo(() => {
    const raw = (params as any)?.id;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [shopId, setShopId] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryRow[]>([]);

  const [form, setForm] = useState<EditForm>({
    name: "",
    category: "",
    quantity: "0",
    minQuantity: "0",
    costPrice: "0",
    sellingPrice: "0",
    expiryDate: "",
  });

  const getStockStatus = (quantity: number, minQuantity: number) => {
    if (quantity <= Math.max(1, Math.floor(minQuantity / 2))) return "critical";
    if (quantity <= minQuantity) return "low";
    return "healthy";
  };

  useEffect(() => {
    const load = async () => {
      if (!productId) return;
      try {
        setLoading(true);
        setErrorMsg("");
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

        setShopId(shop.id);

        const { data: cats } = await supabase
          .from("product_categories")
          .select("id, name")
          .eq("shop_id", shop.id)
          .order("name", { ascending: true });

        setCategories(cats ?? []);

        const { data: product } = await supabase
          .from("products")
          .select(
            `
              id,
              name,
              quantity,
              min_quantity,
              cost_price,
              selling_price,
              expiry_date,
              product_categories(name)
            `
          )
          .eq("shop_id", shop.id)
          .eq("id", productId)
          .maybeSingle();

        if (!product) {
          setErrorMsg("Product not found.");
          return;
        }

        const categoryName =
          Array.isArray((product as any).product_categories)
            ? (product as any).product_categories?.[0]?.name
            : (product as any).product_categories?.name;

        setForm({
          name: product.name ?? "",
          category: categoryName ?? "",
          quantity: String(product.quantity ?? 0),
          minQuantity: String(product.min_quantity ?? 0),
          costPrice: String(product.cost_price ?? 0),
          sellingPrice: String(product.selling_price ?? 0),
          expiryDate: product.expiry_date ? String(product.expiry_date) : "",
        });
      } catch (e) {
        console.error("Failed to load product for edit:", e);
        setErrorMsg("Could not load product.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [productId, router]);

  const handleSave = async () => {
    if (!shopId) return;
    try {
      setSubmitting(true);
      setErrorMsg("");

      const supabase = createClient();

      const quantity = Number(form.quantity || 0);
      const minQuantity = Number(form.minQuantity || 0);
      const costPrice = Number(form.costPrice || 0);
      const sellingPrice = Number(form.sellingPrice || 0);
      const status = getStockStatus(quantity, minQuantity);

      // Find/create category in this shop by name.
      let categoryId: string | null = null;
      if (form.category.trim()) {
        const { data: existing } = await supabase
          .from("product_categories")
          .select("id")
          .eq("shop_id", shopId)
          .eq("name", form.category.trim())
          .maybeSingle();

        if (existing?.id) {
          categoryId = existing.id;
        } else {
          const { data: created, error: createdError } = await supabase
            .from("product_categories")
            .insert({ shop_id: shopId, name: form.category.trim() })
            .select("id")
            .single();
          if (createdError) throw createdError;
          categoryId = created.id;
        }
      }

      const { error } = await supabase
        .from("products")
        .update({
          name: form.name,
          category_id: categoryId,
          quantity,
          min_quantity: minQuantity,
          cost_price: costPrice,
          selling_price: sellingPrice,
          expiry_date: form.expiryDate || null,
          status,
        })
        .eq("id", productId)
        .eq("shop_id", shopId);

      if (error) throw error;

      router.push("/inventory");
    } catch (e) {
      console.error("Failed to save edited product:", e);
      setErrorMsg("Could not save changes.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-8 animate-fade-in-up">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight text-on-surface">Edit Product</h1>
        <p className="text-on-surface-variant mt-1 font-medium">Update inventory and pricing details</p>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <p className="text-on-surface-variant font-medium">Loading…</p>
      ) : (
        <div className="bg-surface-container-lowest rounded-xl p-7 shadow-card space-y-6">
          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="text-xs font-extrabold uppercase tracking-wider text-on-surface-variant block mb-2">
                Product Name *
              </label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary-container/30 transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-extrabold uppercase tracking-wider text-on-surface-variant block mb-2">
                Category *
              </label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary-container/30 transition-all text-on-surface cursor-pointer"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
                {!categories.some((c) => c.name === form.category) && form.category.trim() && (
                  <option value={form.category.trim()}>{form.category.trim()}</option>
                )}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="text-xs font-extrabold uppercase tracking-wider text-on-surface-variant block mb-2">
                Quantity (units) *
              </label>
              <input
                type="number"
                min="0"
                value={form.quantity}
                onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary-container/30 transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-extrabold uppercase tracking-wider text-on-surface-variant block mb-2">
                Min Stock Alert *
              </label>
              <input
                type="number"
                min="0"
                value={form.minQuantity}
                onChange={(e) => setForm((f) => ({ ...f, minQuantity: e.target.value }))}
                className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary-container/30 transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="text-xs font-extrabold uppercase tracking-wider text-on-surface-variant block mb-2">
                Cost Price (₹) *
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.costPrice}
                onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))}
                className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary-container/30 transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-extrabold uppercase tracking-wider text-on-surface-variant block mb-2">
                Selling Price (₹) *
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.sellingPrice}
                onChange={(e) => setForm((f) => ({ ...f, sellingPrice: e.target.value }))}
                className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary-container/30 transition-all"
              />
            </div>
          </div>

          <div className="max-w-xs">
            <label className="text-xs font-extrabold uppercase tracking-wider text-on-surface-variant block mb-2">
              Expiry Date (optional)
            </label>
            <input
              type="date"
              value={form.expiryDate}
              onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
              className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary-container/30 transition-all text-on-surface"
            />
          </div>

          <div className="flex gap-4 pt-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={submitting}
              className={`flex-1 py-3.5 rounded-xl font-bold text-sm transition-all active:scale-[0.98] shadow-card ${
                submitting
                  ? "bg-emerald-500 text-white cursor-default"
                  : "cta-gradient text-white hover:opacity-90"
              }`}
            >
              {submitting ? "Saving…" : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/inventory")}
              className="px-6 py-3.5 rounded-xl font-bold text-sm text-on-surface-variant bg-surface-container hover:bg-surface-container-high transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

