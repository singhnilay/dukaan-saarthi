-- ============================================================
-- DUKAAN BRIGHT — FINANCES MIGRATION
-- Run this entire script once in the Supabase SQL Editor.
-- ============================================================

-- ── 1. shops (add monthly_goal column if missing) ────────────
create extension if not exists pgcrypto;
alter table public.shops add column if not exists monthly_goal numeric(12,2) not null default 0;

-- ── 2. expense_categories ────────────────────────────────────
create table if not exists public.expense_categories (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid references public.shops(id) on delete cascade,
  category_code text not null,
  label         text not null,
  icon          text not null default 'receipt_long',
  is_default    boolean not null default false,
  created_at    timestamptz not null default now()
);

alter table public.expense_categories add column if not exists shop_id uuid references public.shops(id) on delete cascade;
alter table public.expense_categories add column if not exists category_code text;

-- If this table was created before category_code existed, preserve the prior code column values.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'expense_categories'
      AND column_name = 'code'
  ) THEN
    UPDATE public.expense_categories
    SET category_code = code
    WHERE category_code IS NULL;
  END IF;
END;
$$;

alter table public.expense_categories alter column category_code set not null;

alter table public.expense_categories enable row level security;
drop policy if exists "owner can manage expense_categories" on public.expense_categories;
create policy "owner can manage expense_categories"
  on public.expense_categories for all
  using (
    shop_id is null
    or shop_id in (select id from public.shops where owner_user_id = auth.uid())
  );

-- seed global defaults (shop_id = null means available to everyone)
insert into public.expense_categories (category_code, label, icon, is_default, shop_id) values
  ('rent',        'Shop Rent',          'home',           true, null),
  ('electricity', 'Electricity Bill',   'bolt',           true, null),
  ('salaries',    'Staff Salaries',     'group',          true, null),
  ('internet',    'Internet & Phone',   'wifi',           true, null),
  ('packaging',   'Packaging',          'inventory_2',    true, null),
  ('maintenance', 'Shop Maintenance',   'construction',   true, null),
  ('supplies',    'Wholesale Supplies', 'local_shipping', true, null)
on conflict do nothing;

-- ── 3. shop_monthly_expenses ─────────────────────────────────
create table if not exists public.shop_monthly_expenses (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops(id) on delete cascade,
  category_id uuid not null references public.expense_categories(id) on delete cascade,
  month       date not null,
  amount      numeric(12,2) not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (shop_id, category_id, month)
);
alter table public.shop_monthly_expenses enable row level security;
drop policy if exists "owner can manage shop_monthly_expenses" on public.shop_monthly_expenses;
create policy "owner can manage shop_monthly_expenses"
  on public.shop_monthly_expenses for all
  using (shop_id in (select id from public.shops where owner_user_id = auth.uid()));

-- ── 4. bills ─────────────────────────────────────────────────
-- Tracks individual recurring & one-off payment obligations.
create table if not exists public.bills (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops(id) on delete cascade,
  label       text not null,
  category    text not null default 'other',
  icon        text not null default 'receipt_long',
  amount      numeric(12,2) not null default 0,
  due_date    date not null,
  status      text not null default 'unpaid'
              check (status in ('paid','unpaid','overdue')),
  recurring   boolean not null default false,
  paid_date   date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.bills enable row level security;
drop policy if exists "owner can manage bills" on public.bills;
create policy "owner can manage bills"
  on public.bills for all
  using (shop_id in (select id from public.shops where owner_user_id = auth.uid()));

-- auto-mark bills overdue every time they are fetched (via a view)
create or replace view public.bills_with_status as
  select *,
    case
      when status = 'paid'               then 'paid'
      when due_date < current_date       then 'overdue'
      else 'unpaid'
    end as computed_status
  from public.bills;

-- ── 5. sale_transactions ─────────────────────────────────────
create table if not exists public.sale_transactions (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references public.shops(id) on delete cascade,
  product_name  text not null,
  category      text not null default 'Other',
  qty           integer not null default 1,
  unit_price    numeric(12,2) not null,
  total_revenue numeric(12,2) not null,
  total_cost    numeric(12,2) not null default 0,
  profit        numeric(12,2) generated always as (total_revenue - total_cost) stored,
  sale_date     date not null default current_date,
  created_at    timestamptz not null default now()
);
alter table public.sale_transactions enable row level security;
drop policy if exists "owner can manage sale_transactions" on public.sale_transactions;
create policy "owner can manage sale_transactions"
  on public.sale_transactions for all
  using (shop_id in (select id from public.shops where owner_user_id = auth.uid()));

-- ── 6. Helper: monthly summary view ──────────────────────────
create or replace view public.monthly_sales_summary as
  select
    shop_id,
    to_char(date_trunc('month', sale_date), 'Mon') as month,
    date_trunc('month', sale_date)                  as month_date,
    sum(total_revenue) as revenue,
    sum(total_cost)    as cost,
    sum(profit)        as profit
  from public.sale_transactions
  group by shop_id, date_trunc('month', sale_date)
  order by month_date;

-- ── 7. updated_at triggers (optional but useful) ─────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trg_bills_updated_at on public.bills;
create trigger trg_bills_updated_at
  before update on public.bills
  for each row execute function public.set_updated_at();

drop trigger if exists trg_sme_updated_at on public.shop_monthly_expenses;
create trigger trg_sme_updated_at
  before update on public.shop_monthly_expenses
  for each row execute function public.set_updated_at();

-- ── Done ──────────────────────────────────────────────────────
-- Tables created: expense_categories, shop_monthly_expenses,
--                 bills, sale_transactions
-- Views created:  bills_with_status, monthly_sales_summary
