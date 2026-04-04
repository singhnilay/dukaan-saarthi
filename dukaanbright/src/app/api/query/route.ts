import { NextResponse } from "next/server";
import { resolveUserShop } from "@/lib/supabase/shopResolver";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const DAILY_QUERY_LIMIT = 10;
const LIMIT_MESSAGE = "buy premium your free tier limits are over";
const NVIDIA_INVOKE_URL = process.env.NVIDIA_INVOKE_URL ?? "https://integrate.api.nvidia.com/v1/chat/completions";
const memoryQuotaStore = new Map<string, number>();

type QuotaResult = {
  allowed: boolean;
  remaining: number;
  used: number;
};

async function consumeDailyQuota(
  actorKey: string,
  shopId: string,
): Promise<QuotaResult> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .rpc("consume_ai_query_quota", {
      p_actor_key: actorKey,
      p_shop_id: shopId,
      p_daily_limit: DAILY_QUERY_LIMIT,
    });

  if (!error) {
    const row = Array.isArray(data) ? data[0] : data;
    return {
      allowed: Boolean(row?.allowed),
      remaining: Number(row?.remaining ?? 0),
      used: Number(row?.used ?? DAILY_QUERY_LIMIT),
    };
  }

  const dateKey = new Date().toISOString().slice(0, 10);
  const key = `${actorKey}:${dateKey}`;
  const current = memoryQuotaStore.get(key) ?? 0;

  if (current >= DAILY_QUERY_LIMIT) {
    return {
      allowed: false,
      remaining: 0,
      used: DAILY_QUERY_LIMIT,
    };
  }

  const used = current + 1;
  memoryQuotaStore.set(key, used);
  return {
    allowed: true,
    remaining: DAILY_QUERY_LIMIT - used,
    used,
  };
}

function extractNvidiaAnswer(payload: any): string {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const lines = content
      .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
      .filter((line: string) => line.trim().length > 0);
    return lines.join("\n").trim();
  }

  return "";
}

async function queryNvidia(userQuery: string, nvidiaApiKey: string): Promise<string> {
  const configuredMaxTokens = Number(process.env.NVIDIA_MAX_TOKENS ?? 512);
  const maxTokens = Math.min(Math.max(128, configuredMaxTokens), 2048);
  const timeoutMs = Math.min(Math.max(Number(process.env.NVIDIA_TIMEOUT_MS ?? 20000), 5000), 120000);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const response = await fetch(NVIDIA_INVOKE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${nvidiaApiKey}`,
    },
    body: JSON.stringify({
      model: process.env.NVIDIA_MODEL ?? "google/gemma-4-31b-it",
      messages: [{ role: "user", content: userQuery }],
      max_tokens: maxTokens,
      temperature: Number(process.env.NVIDIA_TEMPERATURE ?? 1.0),
      top_p: Number(process.env.NVIDIA_TOP_P ?? 0.95),
      stream: false,
      chat_template_kwargs: { enable_thinking: true },
    }),
    signal: controller.signal,
  }).catch((error) => {
    if (error?.name === "AbortError") {
      throw new Error("NVIDIA request timed out. Please try a shorter query.");
    }
    throw error;
  }).finally(() => {
    clearTimeout(timeoutId);
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const apiError = payload?.error?.message ?? "NVIDIA request failed";
    throw new Error(apiError);
  }

  const answer = extractNvidiaAnswer(payload);
  if (!answer) {
    throw new Error("NVIDIA returned empty answer");
  }

  return answer;
}

export async function POST(request: Request) {
  try {
    const supabase = createServiceClient();
    const body = await request.json().catch(() => ({}));
    const userQuery = typeof body?.query === "string" ? body.query.trim() : "";
    const providedShopId = typeof body?.shopId === "string" ? body.shopId : "";

    if (!userQuery) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    if (userQuery.length > 1200) {
      return NextResponse.json({ error: "query is too long" }, { status: 400 });
    }

    const nvidiaApiKey = process.env.NVIDIA_API_KEY;
    if (!nvidiaApiKey) {
      return NextResponse.json({ error: "Missing NVIDIA_API_KEY" }, { status: 500 });
    }

    const devBypassAuth = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "1";
    const authHeader = request.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    const user = userError ? null : userData?.user ?? null;

    let actorKey = "";
    let shopId = "";

    if (user) {
      const shop = await resolveUserShop(supabase, user.id, "id");
      const resolvedShopId = typeof shop?.id === "string" ? shop.id : "";

      if (!resolvedShopId) {
        return NextResponse.json({ error: "Shop not found" }, { status: 404 });
      }

      actorKey = `user:${user.id}`;
      shopId = resolvedShopId;
    } else if (devBypassAuth && providedShopId) {
      const { data: shopRow } = await supabase
        .from("shops")
        .select("id")
        .eq("id", providedShopId)
        .maybeSingle();

      if (!shopRow?.id) {
        return NextResponse.json({ error: "Shop not found" }, { status: 404 });
      }

      actorKey = `shop:${providedShopId}`;
      shopId = providedShopId;
    } else {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const quota = await consumeDailyQuota(actorKey, shopId);
    if (!quota.allowed) {
      return NextResponse.json(
        {
          error: LIMIT_MESSAGE,
          usedToday: DAILY_QUERY_LIMIT,
          remaining: 0,
          limit: DAILY_QUERY_LIMIT,
        },
        { status: 429 },
      );
    }

    try {
      const answer = await queryNvidia(userQuery, nvidiaApiKey);
      return NextResponse.json({
        answer,
        provider: "nvidia",
        usedToday: quota.used,
        remaining: quota.remaining,
        limit: DAILY_QUERY_LIMIT,
      });
    } catch (error: any) {
      const nvidiaError = error?.message ?? "NVIDIA request failed";
      return NextResponse.json({ error: nvidiaError, provider: "nvidia" }, { status: 502 });
    }
  } catch (error) {
    console.error("Unexpected error in POST /api/query", error);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}