import { NextRequest } from "next/server";

const OFF_BASE = "https://world.openfoodfacts.org/api/v2/product/";

export async function GET(req: NextRequest) {
  const barcode = req.nextUrl.searchParams.get("barcode");
  if (!barcode) {
    return new Response("barcode required", { status: 400 });
  }

  const url = `${OFF_BASE}${encodeURIComponent(barcode)}.json`;

  try {
    const upstream = await fetch(url, {
      headers: { "User-Agent": "dukaanbright/1.0 (+github.com/dukaanbright)" },
      cache: "no-store",
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error("OpenFoodFacts proxy failed", error);
    return new Response(JSON.stringify({ status: 0, error: "upstream unavailable" }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
}
