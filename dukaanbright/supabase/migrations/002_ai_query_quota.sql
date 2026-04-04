-- Gemini query free-tier usage tracking

create table if not exists public.ai_query_usage (
  id uuid primary key default gen_random_uuid(),
  actor_key text not null,
  shop_id uuid references public.shops(id) on delete set null,
  query_date date not null default current_date,
  usage_count integer not null default 0 check (usage_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (actor_key, query_date)
);

create index if not exists ai_query_usage_shop_idx
  on public.ai_query_usage(shop_id, query_date);

create or replace function public.consume_ai_query_quota(
  p_actor_key text,
  p_shop_id uuid,
  p_daily_limit integer default 10
)
returns table(allowed boolean, remaining integer, used integer)
language plpgsql
security definer
as $$
declare
  v_used integer;
begin
  insert into public.ai_query_usage (actor_key, shop_id, query_date, usage_count)
  values (p_actor_key, p_shop_id, current_date, 0)
  on conflict (actor_key, query_date) do nothing;

  update public.ai_query_usage
  set usage_count = usage_count + 1,
      shop_id = coalesce(public.ai_query_usage.shop_id, p_shop_id),
      updated_at = now()
  where actor_key = p_actor_key
    and query_date = current_date
    and usage_count < p_daily_limit
  returning usage_count into v_used;

  if v_used is null then
    select usage_count into v_used
    from public.ai_query_usage
    where actor_key = p_actor_key
      and query_date = current_date;

    return query select false, 0, coalesce(v_used, p_daily_limit);
  end if;

  return query select true, greatest(0, p_daily_limit - v_used), v_used;
end;
$$;

grant execute on function public.consume_ai_query_quota(text, uuid, integer) to anon, authenticated, service_role;
