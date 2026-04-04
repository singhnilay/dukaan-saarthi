"use client";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { resolveUserShop } from "@/lib/supabase/shopResolver";
import { lookupProductAggregated, type ScannedProduct } from "@/lib/openFoodFacts";
import { useBarcodeScanner, type ScanStatus } from "@/lib/scanner";

const categories = [
  "Grains & Flour", "Dairy", "Instant Food", "Beverages",
  "Personal Care", "Oils & Ghee", "Tea & Coffee", "Snacks", "Cleaning", "Other",
];

export default function AddProductPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "", category: "", quantity: "", minQuantity: "",
    costPrice: "", sellingPrice: "", expiryDate: "", barcode: "",
  });
  const [saved, setSaved] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupStatus, setLookupStatus] = useState<ScanStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const applyProductToForm = useCallback((barcode: string, product: ScannedProduct | null) => {
    setForm((prev) => ({
      ...prev,
      barcode,
      name: prev.name || product?.name || prev.name,
      category: prev.category || product?.category || prev.category,
      costPrice:
        prev.costPrice ||
        (product?.price ? Number((product.price * 0.85).toFixed(2)).toString() : prev.costPrice),
      sellingPrice: prev.sellingPrice || (product?.price ? product.price.toString() : prev.sellingPrice),
    }));
  }, []);

  const handleLookup = useCallback(async (rawBarcode: string) => {
    const barcode = rawBarcode.replace(/\D/g, "");
    if (!barcode) {
      setLookupStatus({ type: "error", message: "Enter a valid barcode first." });
      return;
    }

    setIsLookingUp(true);
    setLookupStatus({ type: "info", message: `Looking up ${barcode}...` });

    try {
      const aggregated = await lookupProductAggregated(barcode);
      const product = aggregated.resolved;

      applyProductToForm(barcode, product);

      if (!product) {
        setLookupStatus({ type: "error", message: "No product found for this barcode." });
        return;
      }

      const sourceLabel = aggregated.sources.openFoodFacts && aggregated.sources.serpapi
        ? "OpenFoodFacts + SerpApi"
        : product.source === "openfoodfacts"
        ? "OpenFoodFacts"
        : "SerpApi";

      setLookupStatus({ type: "success", message: `Found ${product.name} (${sourceLabel}). Pre-filled fields.` });
    } catch (error) {
      console.error("Barcode lookup failed:", error);
      setLookupStatus({ type: "error", message: "Lookup failed. Try again." });
    } finally {
      setIsLookingUp(false);
    }
  }, [applyProductToForm]);

  const onScanResult = useCallback(async (rawBarcode: string) => {
    const barcode = rawBarcode.replace(/\D/g, "");
    setForm((prev) => ({ ...prev, barcode }));
    await handleLookup(barcode);
  }, [handleLookup]);

  const {
    videoRef,
    status: scannerStatus,
    cameraDevices,
    isCameraActive,
    isTorchSupported,
    isTorchOn,
    toggleTorch,
    switchCamera,
    scanCurrentFrame,
  } = useBarcodeScanner({ isActive: scanning, onResult: onScanResult });

  const handleScan = () => {
    setLookupStatus(null);
    setScanning((prev) => !prev);
  };

  const handleManualLookup = () => void handleLookup(form.barcode);

  const getStockStatus = (quantity: number, minQuantity: number) => {
    if (quantity <= Math.max(1, Math.floor(minQuantity / 2))) return "critical";
    if (quantity <= minQuantity) return "low";
    return "healthy";
  };

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

      const shop = (await resolveUserShop(supabase, user.id, "id")) as { id: string } | null;
      if (!shop) {
        setErrorMsg("Shop setup not found. Please complete onboarding first.");
        return;
      }

      const shopId = String(shop.id);

      // Find/create product category for this shop.
      let categoryId: string | null = null;
      if (form.category) {
        const { data: existingCategory } = await supabase
          .from("product_categories")
          .select("id")
          .eq("shop_id", shopId)
          .eq("name", form.category)
          .maybeSingle();

        if (existingCategory?.id) {
          categoryId = existingCategory.id;
        } else {
          const { data: createdCategory, error: categoryError } = await supabase
            .from("product_categories")
            .insert({ shop_id: shopId, name: form.category })
            .select("id")
            .single();
          if (categoryError) throw categoryError;
          categoryId = createdCategory.id;
        }
      }

      const quantity = Number(form.quantity || 0);
      const minQuantity = Number(form.minQuantity || 0);
      const stockStatus = getStockStatus(quantity, minQuantity);
      const normalizedBarcode = form.barcode.replace(/\D/g, "");

      const { error } = await supabase.from("products").insert({
        shop_id: shopId,
        name: form.name,
        category_id: categoryId,
        barcode: normalizedBarcode || null,
        quantity,
        min_quantity: minQuantity,
        cost_price: Number(form.costPrice || 0),
        selling_price: Number(form.sellingPrice || 0),
        expiry_date: form.expiryDate || null,
        status: stockStatus,
      });

      if (error) throw error;

      setSaved(true);
      setTimeout(() => router.push("/inventory"), 800);
    } catch (error) {
      console.error("Failed to add product:", error);
      setErrorMsg("Could not save product. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const profit = form.costPrice && form.sellingPrice
    ? Number(form.sellingPrice) - Number(form.costPrice) : 0;
  const margin = form.costPrice && form.sellingPrice && Number(form.costPrice) > 0
    ? ((profit / Number(form.costPrice)) * 100).toFixed(1) : "0";

  return (
    <div className="max-w-3xl space-y-8 animate-fade-in-up">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight text-on-surface">Add Product</h1>
        <p className="text-on-surface-variant mt-1 font-medium">Fill in details or scan barcode to add quickly</p>
      </div>

      {/* Barcode scan strip */}
      <div className="bg-surface-container-lowest rounded-xl p-5 shadow-card space-y-4">
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${scanning ? "bg-primary-container/20 animate-pulse" : "bg-surface-container-low"}`}>
            <span className="material-symbols-outlined text-primary-container text-[24px]">qr_code_scanner</span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-on-surface">Scan Barcode</p>
            <p className="text-xs text-on-surface-variant font-medium">Auto-fill product details from barcode</p>
            {form.barcode && <p className="text-xs font-extrabold text-emerald-600 mt-0.5">Last scanned: {form.barcode}</p>}
            {lookupStatus && (
              <p
                className={`mt-1 text-xs font-bold ${
                  lookupStatus.type === "success"
                    ? "text-emerald-600"
                    : lookupStatus.type === "error"
                    ? "text-red-600"
                    : "text-on-surface-variant"
                }`}
              >
                {lookupStatus.message}
              </p>
            )}
            {scannerStatus && (
              <p className="text-[11px] text-on-surface-variant font-medium mt-1">{scannerStatus.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleScan}
              className="px-5 py-2.5 cta-gradient text-white rounded-xl font-bold text-sm shadow-card hover:opacity-90 active:scale-95 transition-all disabled:opacity-60"
            >
              {scanning ? "Stop Scan" : "Scan Now"}
            </button>
            <button
              type="button"
              onClick={() => void scanCurrentFrame()}
              disabled={!isCameraActive || isLookingUp}
              className="px-5 py-2.5 rounded-xl font-bold text-sm border border-outline/20 text-on-surface hover:bg-surface-container disabled:opacity-60"
            >
              Scan Current Frame
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex flex-1 items-center gap-2">
            <input
              name="barcode"
              inputMode="numeric"
              value={form.barcode}
              onChange={handleChange}
              placeholder="Enter barcode digits"
              className="flex-1 bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary-container/30 placeholder:text-slate-400 transition-all"
            />
            <button
              type="button"
              onClick={handleManualLookup}
              disabled={isLookingUp}
              className="px-5 py-3 md-button-primary disabled:opacity-60"
            >
              {isLookingUp ? "Looking..." : "Lookup"}
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={switchCamera}
              disabled={!scanning || cameraDevices.length < 2}
              className="px-4 py-2 rounded-xl font-bold text-sm bg-surface-container text-on-surface hover:bg-surface-container-high disabled:opacity-60"
            >
              Switch Camera
            </button>
            <button
              type="button"
              onClick={toggleTorch}
              disabled={!scanning || !isTorchSupported}
              className={`px-4 py-2 rounded-xl font-bold text-sm border border-outline/20 ${
                isTorchOn ? "bg-primary text-white" : "bg-surface-container text-on-surface"
              } disabled:opacity-60`}
            >
              {isTorchOn ? "Torch On" : "Torch"}
            </button>
          </div>
        </div>

        {scanning && (
          <div className="grid gap-4 md:grid-cols-[1fr_260px] items-center">
            <div className="relative h-64 w-full overflow-hidden rounded-2xl border-2 border-primary bg-black/40 scanner-shell">
              <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" playsInline muted autoPlay />
              <div className="absolute inset-4 rounded-xl border border-primary/70 scanner-target" />
              <div className="absolute left-4 right-4 h-0.5 bg-primary/90 scanner-sweep-line" />
              <div className="absolute left-6 top-6 h-6 w-6 border-l-2 border-t-2 border-primary/90" />
              <div className="absolute right-6 top-6 h-6 w-6 border-r-2 border-t-2 border-primary/90" />
              <div className="absolute bottom-6 left-6 h-6 w-6 border-b-2 border-l-2 border-primary/90" />
              <div className="absolute bottom-6 right-6 h-6 w-6 border-b-2 border-r-2 border-primary/90" />
            </div>
            <div className="space-y-1 text-xs text-on-surface-variant font-medium">
              <p className="text-primary-container font-bold">Scanner active</p>
              <p>1) Use the rear camera for best focus.</p>
              <p>2) Fill most of the frame with the barcode lines.</p>
              <p>3) If auto scan is slow, tap Scan Current Frame.</p>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="bg-surface-container-lowest rounded-xl p-7 shadow-card space-y-6">
        {errorMsg && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {errorMsg}
          </div>
        )}
        {/* Row 1: Name + Category */}
        <div className="grid grid-cols-2 gap-5">
          <div>
            <label className="text-xs font-extrabold uppercase tracking-wider text-on-surface-variant block mb-2">
              Product Name *
            </label>
            <input
              name="name" required value={form.name} onChange={handleChange}
              placeholder="e.g. Aashirvaad Atta 5kg"
              className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary-container/30 placeholder:text-slate-400 transition-all"
            />
          </div>
          <div>
            <label className="text-xs font-extrabold uppercase tracking-wider text-on-surface-variant block mb-2">
              Category *
            </label>
            <select
              name="category" required value={form.category} onChange={handleChange}
              className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary-container/30 transition-all text-on-surface"
            >
              <option value="">Select category…</option>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Row 2: Qty + Min Qty */}
        <div className="grid grid-cols-2 gap-5">
          {[
            { name: "quantity", label: "Quantity (units) *", placeholder: "e.g. 50", type: "number" },
            { name: "minQuantity", label: "Min Stock Alert", placeholder: "e.g. 10", type: "number" },
          ].map((f) => (
            <div key={f.name}>
              <label className="text-xs font-extrabold uppercase tracking-wider text-on-surface-variant block mb-2">{f.label}</label>
              <input
                name={f.name} required={f.name === "quantity"} type={f.type} min="0"
                value={form[f.name as keyof typeof form]} onChange={handleChange} placeholder={f.placeholder}
                className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary-container/30 placeholder:text-slate-400 transition-all"
              />
            </div>
          ))}
        </div>

        {/* Row 3: Cost Price + Selling Price */}
        <div className="grid grid-cols-2 gap-5">
          {[
            { name: "costPrice", label: "Cost Price (₹) *", placeholder: "e.g. 210" },
            { name: "sellingPrice", label: "Selling Price (₹) *", placeholder: "e.g. 245" },
          ].map((f) => (
            <div key={f.name}>
              <label className="text-xs font-extrabold uppercase tracking-wider text-on-surface-variant block mb-2">{f.label}</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant font-bold text-sm">₹</span>
                <input
                  name={f.name} required type="number" min="0" step="0.01"
                  value={form[f.name as keyof typeof form]} onChange={handleChange} placeholder={f.placeholder}
                  className="w-full bg-surface-container-low border-none rounded-xl pl-8 pr-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary-container/30 placeholder:text-slate-400 transition-all"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Profit preview */}
        {profit > 0 && (
          <div className="flex items-center gap-6 p-4 bg-emerald-50 rounded-xl border border-emerald-100">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">Profit per unit</p>
              <p className="text-2xl font-extrabold text-emerald-700">₹{profit}</p>
            </div>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">Margin</p>
              <p className="text-2xl font-extrabold text-emerald-700">{margin}%</p>
            </div>
            <span className="material-symbols-outlined text-emerald-500 ml-auto text-[32px]">trending_up</span>
          </div>
        )}

        {/* Expiry Date */}
        <div className="max-w-xs">
          <label className="text-xs font-extrabold uppercase tracking-wider text-on-surface-variant block mb-2">
            Expiry Date (optional)
          </label>
          <input
            name="expiryDate" type="date" value={form.expiryDate} onChange={handleChange}
            className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary-container/30 transition-all text-on-surface"
          />
        </div>

        {/* Submit */}
        <div className="flex gap-4 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className={`flex-1 py-3.5 rounded-xl font-bold text-sm transition-all active:scale-[0.98] shadow-card ${
              saved ? "bg-emerald-500 text-white" : "cta-gradient text-white hover:opacity-90"
            }`}
          >
            {saved ? "✓ Product Added! Redirecting…" : submitting ? "Saving..." : "Add to Inventory"}
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
