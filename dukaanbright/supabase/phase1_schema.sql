-- Phase 1 core tables for sales + recommendations
-- Run inside your Supabase SQL editor or psql. Assumes existing shops, products tables.

-- Sales transactions
create table if not exists public.sales_transactions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity numeric not null check (quantity > 0),
  unit_price numeric not null check (unit_price >= 0),
  discount_pct numeric not null default 0 check (discount_pct >= 0 and discount_pct <= 100),
  payment_mode text not null default 'Cash',
  customer_label text,
  note text,
  gross_amount numeric not null default 0,
  discount_amount numeric not null default 0,
  net_amount numeric not null default 0,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists sales_transactions_shop_idx on public.sales_transactions(shop_id);
create index if not exists sales_transactions_product_idx on public.sales_transactions(product_id);

-- Recommendation action log
create table if not exists public.recommendation_actions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  insight_id uuid references public.ai_price_suggestions(id) on delete set null,
  action text not null check (action in ('apply','dismiss')),
  note text,
  acted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists recommendation_actions_shop_idx on public.recommendation_actions(shop_id);
create index if not exists recommendation_actions_insight_idx on public.recommendation_actions(insight_id);

-- Demand metrics (lightweight starter)
create table if not exists public.product_demand_metrics (
  product_id uuid primary key references public.products(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  demand_7d numeric default 0,
  demand_30d numeric default 0,
  trend text default 'stable',
  updated_at timestamptz not null default now()
);

-- KPI spotlight telemetry
create table if not exists public.kpi_spotlight_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  kpi_code text not null,
  context text,
  shown_at timestamptz not null default now()
);

-- Optional: helper function to apply sale and decrement inventory atomically
-- Requires postgres extension pgcrypto for gen_random_uuid; adjust if not available.
create or replace function public.apply_sale_transaction(
  p_shop_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_unit_price numeric,
  p_discount_pct numeric,
  p_payment_mode text,
  p_customer_label text,
  p_note text
) returns uuid language plpgsql security definer as $$
declare
  v_sale_id uuid;
begin
  insert into public.sales_transactions (
    shop_id, product_id, quantity, unit_price, discount_pct,
    payment_mode, customer_label, note, gross_amount, discount_amount, net_amount
  ) values (
    p_shop_id, p_product_id, p_quantity, p_unit_price, coalesce(p_discount_pct,0),
    coalesce(p_payment_mode,'Cash'), left(p_customer_label,120), left(p_note,240),
    p_quantity * p_unit_price,
    (p_quantity * p_unit_price) * coalesce(p_discount_pct,0) / 100,
    (p_quantity * p_unit_price) - ((p_quantity * p_unit_price) * coalesce(p_discount_pct,0) / 100)
  ) returning id into v_sale_id;

  update public.products
    set quantity = greatest(0, quantity - p_quantity)
    where id = p_product_id and shop_id = p_shop_id;

  return v_sale_id;
end;
$$;

-- RLS scaffolding (enable and allow owner writes)
-- alter table public.sales_transactions enable row level security;
-- alter table public.recommendation_actions enable row level security;
-- create policy "allow-owner-sales" on public.sales_transactions
--   for insert using (auth.uid() is not null) with check (exists (select 1 from public.shops s where s.id = shop_id and s.owner_user_id = auth.uid()));
-- create policy "allow-owner-actions" on public.recommendation_actions
--   for insert using (auth.uid() is not null) with check (exists (select 1 from public.shops s where s.id = shop_id and s.owner_user_id = auth.uid()));
