import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { userCanAccessShop } from "@/lib/supabase/shopResolver";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { insightId, action, note } = body ?? {};

    if (!insightId || !action) {
      return NextResponse.json({ error: "insightId and action are required" }, { status: 400 });
    }
    if (!["apply", "dismiss"].includes(action)) {
      return NextResponse.json({ error: "action must be apply or dismiss" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const authHeader = request.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = userData.user;

    const { data: insightRow, error: insightError } = await supabase
      .from("ai_price_suggestions")
      .select("id, shop_id, product_id")
      .eq("id", insightId)
      .maybeSingle();

    if (insightError || !insightRow) {
      return NextResponse.json({ error: "Insight not found" }, { status: 404 });
    }

    const allowed = await userCanAccessShop(
      supabase,
      user.id,
      String(insightRow.shop_id)
    );

    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error: actionError } = await supabase.from("recommendation_actions").insert({
      shop_id: insightRow.shop_id,
      insight_id: insightId,
      product_id: insightRow.product_id,
      action,
      note: note?.slice(0, 240) ?? null,
      acted_by: user.id,
    });

    if (actionError) {
      console.error("Failed to record recommendation action", actionError);
      return NextResponse.json({ error: "Failed to record action" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unexpected error in POST /api/insights/actions", error);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
