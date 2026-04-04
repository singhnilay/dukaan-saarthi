import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const openFoodFactsBase = process.env.OPENFOODFACTS_API_BASE_URL;
  const openFoodFactsUserAgent = process.env.OPENFOODFACTS_USER_AGENT;

  if (!openFoodFactsBase) {
    return new Response(JSON.stringify({ status: 0, error: "OpenFoodFacts base URL missing" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (!openFoodFactsUserAgent) {
    return new Response(JSON.stringify({ status: 0, error: "OpenFoodFacts user agent missing" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const barcode = req.nextUrl.searchParams.get("barcode");
  if (!barcode) {
    return new Response("barcode required", { status: 400 });
  }

  const url = `${openFoodFactsBase}${encodeURIComponent(barcode)}.json`;

  try {
    const upstream = await fetch(url, {
      headers: { "User-Agent": openFoodFactsUserAgent },
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
