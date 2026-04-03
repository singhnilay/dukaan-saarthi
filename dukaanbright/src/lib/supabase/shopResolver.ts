import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;

const LINKED_SHOP_KEYS = ["shop_id", "primary_shop_id", "default_shop_id"] as const;

function toRow(value: unknown): Row | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Row;
}

export async function resolveLinkedShopIdForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  try {
    const { data: userRow } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    const record = toRow(userRow);
    if (!record) return null;

    for (const key of LINKED_SHOP_KEYS) {
      const candidate = record[key];
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        return candidate;
      }
    }
  } catch {
    // Ignore optional linkage lookup failure and continue with owner lookup only.
  }

  return null;
}

export async function resolveUserShop(
  supabase: SupabaseClient,
  userId: string,
  select = "id",
): Promise<Row | null> {
  const { data: directShop } = await supabase
    .from("shops")
    .select(select)
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: true })
    .maybeSingle();

  const directRecord = toRow(directShop);
  if (directRecord) return directRecord;

  const linkedShopId = await resolveLinkedShopIdForUser(supabase, userId);
  if (!linkedShopId) return null;

  const { data: linkedShop } = await supabase
    .from("shops")
    .select(select)
    .eq("id", linkedShopId)
    .maybeSingle();

  const linkedRecord = toRow(linkedShop);
  if (!linkedRecord) return null;

  // Best effort: backfill owner_user_id so future lookups are direct.
  try {
    await supabase
      .from("shops")
      .update({ owner_user_id: userId })
      .eq("id", linkedShopId)
      .is("owner_user_id", null);
  } catch {
    // Ignore backfill failures.
  }

  return linkedRecord;
}

export async function userCanAccessShop(
  supabase: SupabaseClient,
  userId: string,
  shopId: string,
): Promise<boolean> {
  const { data: directMatch } = await supabase
    .from("shops")
    .select("id")
    .eq("id", shopId)
    .eq("owner_user_id", userId)
    .maybeSingle();

  if (directMatch) return true;

  const linkedShopId = await resolveLinkedShopIdForUser(supabase, userId);
  return linkedShopId === shopId;
}
