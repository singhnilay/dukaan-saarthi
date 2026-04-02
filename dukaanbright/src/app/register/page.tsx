"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const STEPS = ["Account", "Shop Info", "Expenses"] as const;
type Step = 0 | 1 | 2;

const languages = ["English", "Hindi", "Marathi", "Tamil", "Telugu", "Bengali", "Gujarati", "Kannada"];
const shopTypes = ["Kirana / General Store", "Medical / Pharmacy", "Electronics", "Clothes & Textiles", "Vegetables & Fruits", "Bakery / Sweet Shop", "Stationery", "Other"];

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const [form, setForm] = useState({
    fullName: "", phone: "", email: "", password: "", confirmPassword: "",
    shopName: "", shopType: "", city: "", language: "English",
    rent: "", electricity: "", salaries: "", other: "",
  });

  const [errors, setErrors] = useState<Partial<typeof form>>({});
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const onboarding = new URLSearchParams(window.location.search).get("onboarding");
    if (onboarding !== "1") return;

    const initGoogleOnboarding = async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return;

      setForm((prev) => ({
        ...prev,
        fullName: user.user_metadata?.full_name ?? prev.fullName,
        email: user.email ?? prev.email,
      }));
      setStep(1);
    };

    void initGoogleOnboarding();
  }, []);

  const set = (field: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: "" }));
  };

  function validateStep(s: Step): boolean {
    const e: Partial<typeof form> = {};
    if (s === 0) {
      if (!form.fullName.trim())       e.fullName = "Name is required";
      if (!form.phone.match(/^\d{10}$/)) e.phone = "Enter a valid 10-digit number";
      if (form.email && !/\S+@\S+\.\S+/.test(form.email)) e.email = "Enter a valid email";
      if (form.password.length < 6)    e.password = "Minimum 6 characters";
      if (form.password !== form.confirmPassword) e.confirmPassword = "Passwords do not match";
    }
    if (s === 1) {
      if (!form.shopName.trim()) e.shopName = "Shop name is required";
      if (!form.shopType)        e.shopType  = "Please select a shop type";
      if (!form.city.trim())     e.city      = "City is required";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const next = () => {
    if (validateStep(step)) setStep((s) => (s + 1) as Step);
  };
  const back = () => setStep((s) => (s - 1) as Step);

  const submitToDashboard = async () => {
    if (!validateStep(2)) return;
    setSubmitting(true);
    setAuthMessage(null);
    setAuthError(null);

    try {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      let user = userData.user;

      const desiredEmail = form.email.trim() || null;
      const phoneDigits = form.phone.replace(/[^\d]/g, "");
      const desiredPhone = phoneDigits
        ? phoneDigits.length === 10
          ? `+91${phoneDigits}`
          : `+${phoneDigits}`
        : null;

      if (user && ((desiredEmail && user.email !== desiredEmail) || (desiredPhone && user.phone !== desiredPhone))) {
        await supabase.auth.signOut();
        user = null;
      }

      if (!user) {
        if (form.email.trim()) {
          const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email: form.email.trim(),
            password: form.password,
            options: {
              data: {
                full_name: form.fullName,
                phone: form.phone ? `+91${form.phone.replace(/[^\d]/g, "")}` : null,
              },
            },
          });

          if (signUpError) throw signUpError;
          user = signUpData.user;

          if (!user) {
            setAuthMessage("Registration started. Check your email to confirm and then sign in.");
            setSubmitting(false);
            return;
          }
        } else {
          const phone = form.phone.replace(/[^\d]/g, "");
          const formattedPhone = phone.length === 10 ? `+91${phone}` : `+${phone}`;

          const { error: otpError } = await supabase.auth.signInWithOtp({
            phone: formattedPhone,
          });

          if (otpError) throw otpError;

          setAuthMessage("OTP sent to your phone. Complete verification to continue onboarding.");
          setSubmitting(false);
          return;
        }
      }

      if (!user) {
        throw new Error("Unable to create or retrieve your account. Please try again.");
      }

      // Ensure custom `users` table has a row for this auth user.
      // `shops.owner_user_id` has a foreign key dependency on it.
      const { error: userUpsertError } = await supabase
        .from("users")
        .upsert(
          {
            id: user.id,
            full_name: form.fullName || user.user_metadata?.full_name || "Shop Owner",
            email: user.email ?? null,
            phone: form.phone || null,
          },
          { onConflict: "id" }
        );

      if (userUpsertError) throw userUpsertError;

      const { data: existingShop } = await supabase
        .from("shops")
        .select("id")
        .eq("owner_user_id", user.id)
        .maybeSingle();

      let shopId = existingShop?.id;
      if (!shopId) {
        const { data: createdShop, error: shopError } = await supabase
          .from("shops")
          .insert({
            owner_user_id: user.id,
            name: form.shopName || `${form.fullName || "My"} Store`,
            shop_type: form.shopType || null,
            city: form.city || null,
            language: form.language || "English",
          })
          .select("id")
          .single();

        if (shopError) throw shopError;
        shopId = createdShop.id;
      }

      const expensesPayload = [
        { code: "rent", value: Number(form.rent || 0) },
        { code: "electricity", value: Number(form.electricity || 0) },
        { code: "salaries", value: Number(form.salaries || 0) },
        { code: "other", value: Number(form.other || 0) },
      ].filter((e) => e.value > 0);

      if (shopId && expensesPayload.length > 0) {
        const { data: categories } = await supabase
          .from("expense_categories")
          .select("id, code")
          .in("code", expensesPayload.map((e) => e.code));

        const monthStart = new Date();
        monthStart.setDate(1);
        const month = monthStart.toISOString().slice(0, 10);

        const categoryByCode = new Map((categories ?? []).map((c) => [c.code, c.id]));
        const upserts = expensesPayload
          .map((e) => {
            const categoryId = categoryByCode.get(e.code);
            if (!categoryId) return null;
            return {
              shop_id: shopId,
              category_id: categoryId,
              month,
              amount: e.value,
            };
          })
          .filter(Boolean);

        if (upserts.length > 0) {
          const { error: expenseError } = await supabase
            .from("shop_monthly_expenses")
            .upsert(upserts, { onConflict: "shop_id,category_id,month" });
          if (expenseError) throw expenseError;
        }
      }

      router.push("/dashboard");
    } catch (error) {
      console.error("Onboarding save failed:", error);
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("21608") || message.includes("unverified") || message.includes("Trial accounts")) {
        setAuthError(
          "Twilio trial accounts can only send OTP to verified phone numbers. Verify this recipient in Twilio or upgrade to a paid Twilio number."
        );
      } else if (message.includes("Unsupported phone provider")) {
        setAuthError(
          "Phone auth is not enabled in Supabase. Enable the phone provider in Supabase Auth or use email registration."
        );
      } else {
        setAuthError(message);
      }
      return;
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setGoogleLoading(true);
    const supabase = createClient();

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/register?onboarding=1")}`,
      },
    });

    if (error) {
      console.error("Google sign-up failed:", error.message);
      setGoogleLoading(false);
    }
  };

  // ── shared input class ──────────────────────────────────────────────────────
  const inp = (err?: string) =>
    `w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm font-medium outline-none transition-all placeholder:text-slate-400 ${
      err ? "ring-2 ring-error/40" : "focus:ring-2 focus:ring-primary-container/30"
    }`;

  return (
    <main className="min-h-screen flex flex-col md:flex-row overflow-hidden bg-surface">

      {/* ── Left brand panel ──────────────────────────────────────────────── */}
      <section className="hidden md:flex md:w-5/12 bg-surface-container-low relative flex-col justify-center px-14 xl:px-20 overflow-hidden">

        {/* Logo */}
        <div className="absolute top-10 left-10 flex items-center gap-3">
          <div className="w-10 h-10 cta-gradient rounded-xl flex items-center justify-center text-white shadow-card">
            <span className="material-symbols-outlined material-symbols-filled text-[20px]">storefront</span>
          </div>
          <span className="font-extrabold text-xl text-primary tracking-tighter">Dukaan Bright</span>
        </div>

        {/* Step indicator sidebar */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 flex flex-col gap-3 pr-6">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2 justify-end">
              <span className={`text-[10px] font-extrabold uppercase tracking-wider transition-all ${i === step ? "text-primary-container" : "text-slate-400"}`}>
                {label}
              </span>
              <div className={`w-2 h-2 rounded-full transition-all duration-300 ${
                i < step  ? "bg-emerald-500" :
                i === step ? "bg-primary-container scale-125" :
                "bg-outline-variant"
              }`} />
            </div>
          ))}
        </div>

        <div className="space-y-6 z-10 max-w-md animate-fade-in-up">
          <h1 className="font-extrabold text-5xl text-on-surface leading-tight tracking-tight">
            Apni dukaan,<br />
            <span className="text-primary-container">apna hisaab</span>
          </h1>
          <p className="text-on-surface-variant text-base font-medium leading-relaxed">
            Join thousands of smart shop owners who track stock, cut losses, and earn more — all in one place.
          </p>

          {/* Benefits list */}.
          <ul className="space-y-3 pt-2">
            {[
              { icon: "check_circle", text: "Free to start — no credit card needed" },
              { icon: "check_circle", text: "Set up in under 3 minutes" },
            
              { icon: "check_circle", text: "AI suggests prices to boost profit" },
              { icon : 'check_circle', text : 'Galle Galle pe business analyst'}
            ].map((b) => (
              <li key={b.text} className="flex items-center gap-3">
                <span className="material-symbols-outlined material-symbols-filled text-emerald-500 text-[18px]">{b.icon}</span>
                <span className="text-sm font-medium text-on-surface-variant">{b.text}</span>
              </li>
            ))}
          </ul>

          {/* Trust badge */}
          <div className="flex items-center gap-3 pt-2">
            <div className="flex -space-x-2">
              {["RK","PM","SJ","AT"].map((i) => (
                <div key={i} className="w-8 h-8 rounded-full cta-gradient border-2 border-white flex items-center justify-center text-white text-[10px] font-bold">
                  {i}
                </div>
              ))}
            </div>
            <p className="text-sm text-on-surface-variant font-medium">
              <span className="font-extrabold text-on-surface">2,400+</span> shop owners trust Dukaan Bright
            </p>
          </div>
        </div>

        {/* Blobs */}
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-primary-container/10 rounded-full blur-3xl translate-x-1/4 translate-y-1/4 pointer-events-none" />
        <div className="absolute top-1/4 left-0 w-56 h-56 bg-secondary-container/25 rounded-full blur-2xl pointer-events-none" />
      </section>

      {/* ── Right form panel ──────────────────────────────────────────────── */}
      <section className="flex-1 flex items-center justify-center px-6 py-10 bg-surface overflow-y-auto">
        <div className="w-full max-w-md space-y-7 animate-fade-in-up animate-delay-100">

          {/* Mobile logo */}
          <div className="md:hidden flex items-center gap-3">
            <div className="w-10 h-10 cta-gradient rounded-xl flex items-center justify-center text-white">
              <span className="material-symbols-outlined material-symbols-filled text-[20px]">storefront</span>
            </div>
            <span className="font-extrabold text-xl text-primary">Dukaan Bright</span>
          </div>

          {/* Progress bar */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <p className="text-xs font-extrabold uppercase tracking-widest text-on-surface-variant">
                Step {step + 1} of {STEPS.length} — <span className="text-primary-container">{STEPS[step]}</span>
              </p>
              <p className="text-xs font-bold text-slate-400">{Math.round(((step) / STEPS.length) * 100)}% done</p>
            </div>
            <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
              <div
                className="h-full cta-gradient rounded-full transition-all duration-500"
                style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Heading */}
          <div>
            {step === 0 && <><h2 className="text-3xl font-extrabold text-on-surface tracking-tight">Create your account</h2>
              <p className="mt-1.5 text-sm font-medium text-on-surface-variant">Start managing your shop smarter today</p></>}
            {step === 1 && <><h2 className="text-3xl font-extrabold text-on-surface tracking-tight">Tell us about your shop</h2>
              <p className="mt-1.5 text-sm font-medium text-on-surface-variant">We'll personalise your experience based on this</p></>}
            {step === 2 && <><h2 className="text-3xl font-extrabold text-on-surface tracking-tight">Monthly expenses</h2>
              <p className="mt-1.5 text-sm font-medium text-on-surface-variant">Used by AI to calculate your actual profit — you can change this later</p></>}
          </div>

          {/* Google (step 0 only) */}
          {authError && (
            <div className="rounded-2xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
              {authError}
            </div>
          )}
          {authMessage && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {authMessage}
            </div>
          )}
          {step === 0 && (
            <>
              <button
                type="button"
                onClick={handleGoogleSignUp}
                disabled={googleLoading}
                className="w-full flex items-center justify-center gap-3 py-3.5 px-6 bg-surface-container-lowest border border-outline-variant rounded-xl font-bold text-sm text-on-surface hover:bg-surface-container-low transition-all shadow-card hover:shadow-card-hover active:scale-[0.98]"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                {googleLoading ? "Redirecting..." : "Sign up with Google"}
              </button>
              <div className="relative flex items-center">
                <div className="flex-1 border-t border-outline-variant" />
                <span className="px-4 text-xs font-bold text-on-surface-variant bg-surface">or fill in your details</span>
                <div className="flex-1 border-t border-outline-variant" />
              </div>
            </>
          )}

          {authMessage && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {authMessage}
            </div>
          )}

          {/* ── FORM ──────────────────────────────────────────────────────── */}
          <form
            // Prevent any native submit so `Enter` can't redirect while typing step 2.
            onSubmit={(e) => e.preventDefault()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (step < 2) next();
              }
            }}
            className="space-y-4"
          >

            {/* ── Step 0: Account ─────────────────────────────────────────── */}
            {step === 0 && (
              <>
                <Field label="Full Name *" error={errors.fullName}>
                  <input value={form.fullName} onChange={(e) => set("fullName", e.target.value)}
                    placeholder="e.g. Rajesh Kumar" className={inp(errors.fullName)} />
                </Field>

                <Field label="Mobile Number *" error={errors.phone}>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-on-surface-variant">+91</span>
                    <input value={form.phone} onChange={(e) => set("phone", e.target.value)}
                      placeholder="9876543210" maxLength={10} inputMode="numeric"
                      className={`${inp(errors.phone)} pl-12`} />
                  </div>
                </Field>

                <Field label="Email (optional)" error={errors.email}>
                  <input value={form.email} onChange={(e) => set("email", e.target.value)}
                    type="email" placeholder="you@email.com" className={inp(errors.email)} />
                </Field>

                <Field label="Password *" error={errors.password}>
                  <div className="relative">
                    <input value={form.password} onChange={(e) => set("password", e.target.value)}
                      type={showPassword ? "text" : "password"} placeholder="Min. 6 characters"
                      className={`${inp(errors.password)} pr-11`} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-on-surface transition-colors">
                      <span className="material-symbols-outlined text-[18px]">{showPassword ? "visibility_off" : "visibility"}</span>
                    </button>
                  </div>
                  {form.password && (
                    <PasswordStrength password={form.password} />
                  )}
                </Field>

                <Field label="Confirm Password *" error={errors.confirmPassword}>
                  <div className="relative">
                    <input value={form.confirmPassword} onChange={(e) => set("confirmPassword", e.target.value)}
                      type={showConfirm ? "text" : "password"} placeholder="Re-enter password"
                      className={`${inp(errors.confirmPassword)} pr-11`} />
                    <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-on-surface transition-colors">
                      <span className="material-symbols-outlined text-[18px]">{showConfirm ? "visibility_off" : "visibility"}</span>
                    </button>
                  </div>
                </Field>
              </>
            )}

            {/* ── Step 1: Shop Info ───────────────────────────────────────── */}
            {step === 1 && (
              <>
                <Field label="Shop Name *" error={errors.shopName}>
                  <input value={form.shopName} onChange={(e) => set("shopName", e.target.value)}
                    placeholder="e.g. Rajesh General Store" className={inp(errors.shopName)} />
                </Field>

                <Field label="Shop Type *" error={errors.shopType}>
                  <select value={form.shopType} onChange={(e) => set("shopType", e.target.value)}
                    className={`${inp(errors.shopType)} cursor-pointer`}>
                    <option value="">Select your shop type…</option>
                    {shopTypes.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </Field>

                <Field label="City *" error={errors.city}>
                  <input value={form.city} onChange={(e) => set("city", e.target.value)}
                    placeholder="e.g. Mumbai" className={inp(errors.city)} />
                </Field>

                <Field label="Preferred Language">
                  <select value={form.language} onChange={(e) => set("language", e.target.value)}
                    className={`${inp()} cursor-pointer`}>
                    {languages.map((l) => <option key={l}>{l}</option>)}
                  </select>
                </Field>

                <div className="p-4 bg-secondary-container/30 rounded-xl flex items-start gap-3 mt-1">
                  <span className="material-symbols-outlined text-primary-container text-[20px] mt-0.5">info</span>
                  <p className="text-xs font-medium text-on-surface-variant leading-relaxed">
                    Your shop type helps AI understand buying patterns and give you better pricing recommendations.
                  </p>
                </div>
              </>
            )}

            {/* ── Step 2: Expenses ────────────────────────────────────────── */}
            {step === 2 && (
              <>
                <div className="p-4 bg-amber-50 rounded-xl flex items-start gap-3 border border-amber-100">
                  <span className="material-symbols-outlined text-amber-500 text-[20px] mt-0.5">lightbulb</span>
                  <p className="text-xs font-medium text-on-surface-variant leading-relaxed">
                    Adding expenses lets AI calculate your <span className="font-extrabold text-on-surface">real profit</span>, not just revenue. All fields are optional — skip if you want.
                  </p>
                </div>

                {[
                  { key: "rent",        label: "Monthly Rent",       icon: "home",       placeholder: "e.g. 8000" },
                  { key: "electricity", label: "Electricity Bill",   icon: "bolt",       placeholder: "e.g. 2200" },
                  { key: "salaries",    label: "Staff Salaries",     icon: "group",      placeholder: "e.g. 12000" },
                  { key: "other",       label: "Other Expenses",     icon: "more_horiz", placeholder: "e.g. 1500" },
                ].map(({ key, label, icon, placeholder }) => (
                  <Field key={key} label={label}>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 w-7 h-7 bg-surface-container rounded-lg flex items-center justify-center">
                        <span className="material-symbols-outlined text-primary-container text-[16px]">{icon}</span>
                      </div>
                      <span className="absolute left-12 top-1/2 -translate-y-1/2 text-xs font-bold text-on-surface-variant">₹</span>
                      <input value={form[key as keyof typeof form]}
                        onChange={(e) => set(key as keyof typeof form, e.target.value)}
                        type="number" min="0" placeholder={placeholder}
                        className={`${inp()} pl-16`} />
                    </div>
                  </Field>
                ))}

                {/* Total */}
                {[form.rent, form.electricity, form.salaries, form.other].some(Boolean) && (
                  <div className="flex items-center justify-between px-4 py-3 bg-surface-container rounded-xl">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-on-surface-variant">Total Monthly Expenses</span>
                    <span className="text-base font-extrabold text-on-surface">
                      ₹{[form.rent, form.electricity, form.salaries, form.other]
                        .reduce((sum, v) => sum + (Number(v) || 0), 0).toLocaleString("en-IN")}
                    </span>
                  </div>
                )}
              </>
            )}

            {/* ── Navigation buttons ──────────────────────────────────────── */}
            <div className={`flex gap-3 pt-2 ${step > 0 ? "flex-row" : "flex-col"}`}>
              {step > 0 && (
                <button type="button" onClick={back}
                  className="flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl font-bold text-sm text-on-surface-variant bg-surface-container hover:bg-surface-container-high transition-all active:scale-[0.98]">
                  <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                  Back
                </button>
              )}

              {step < 2 ? (
                <button type="button" onClick={next}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl cta-gradient text-white font-bold text-sm shadow-card hover:opacity-90 active:scale-[0.98] transition-all">
                  Continue
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </button>
              ) : (
                <button type="button" disabled={submitting} onClick={submitToDashboard}
                  className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm shadow-card transition-all active:scale-[0.98] ${
                    submitting
                      ? "bg-emerald-500 text-white cursor-default"
                      : "cta-gradient text-white hover:opacity-90"
                  }`}>
                  {submitting ? (
                    <><span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span> Setting up your shop…</>
                  ) : (
                    <><span className="material-symbols-outlined text-[18px]">storefront</span> Create My Account</>
                  )}
                </button>
              )}
            </div>

            {/* Skip expenses (step 2 only) */}
            {step === 2 && !submitting && (
              <button type="button" onClick={submitToDashboard}
                className="w-full text-center text-xs font-bold text-on-surface-variant hover:text-primary-container transition-colors py-1">
                Skip for now — I'll add expenses later
              </button>
            )}
          </form>

          {/* Sign-in link */}
          <p className="text-xs text-center text-on-surface-variant font-medium pt-1">
            Already have an account?{" "}
            <Link href="/login" className="text-primary-container font-bold hover:underline">Sign in</Link>
          </p>

          {/* T&C */}
          <p className="text-[10px] text-center text-slate-400 font-medium leading-relaxed">
            By creating an account, you agree to Dukaan Bright's{" "}
            <a href="#" className="underline hover:text-primary-container">Terms of Service</a>{" "}
            and{" "}
            <a href="#" className="underline hover:text-primary-container">Privacy Policy</a>.
          </p>

        </div>
      </section>
    </main>
  );
}

// ── Helper sub-components ─────────────────────────────────────────────────────

function Field({
  label, error, children,
}: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-extrabold uppercase tracking-wider text-on-surface-variant block">
        {label}
      </label>
      {children}
      {error && (
        <p className="text-[11px] font-bold text-error flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">error</span>
          {error}
        </p>
      )}
    </div>
  );
}

function PasswordStrength({ password }: { password: string }) {
  const score =
    (password.length >= 8 ? 1 : 0) +
    (/[A-Z]/.test(password) ? 1 : 0) +
    (/[0-9]/.test(password) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(password) ? 1 : 0);

  const label = ["Weak", "Fair", "Good", "Strong"][score - 1] ?? "Too short";
  const colors = ["bg-error", "bg-amber-400", "bg-yellow-400", "bg-emerald-500"];
  const textColors = ["text-error", "text-amber-500", "text-yellow-500", "text-emerald-600"];

  return (
    <div className="flex items-center gap-2 mt-1.5">
      <div className="flex gap-1 flex-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
              i < score ? colors[score - 1] ?? "bg-error" : "bg-surface-container"
            }`}
          />
        ))}
      </div>
      <span className={`text-[10px] font-extrabold ${textColors[score - 1] ?? "text-slate-400"}`}>
        {label}
      </span>
    </div>
  );
}
