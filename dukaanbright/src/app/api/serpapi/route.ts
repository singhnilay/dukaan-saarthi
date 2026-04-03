import { NextRequest } from "next/server";

const SERPAPI_ENDPOINT = "https://serpapi.com/search.json";
const SERPAPI_KEY = process.env.SERPAPI_API_KEY || process.env.NEXT_PUBLIC_SERPAPI_KEY;

export async function GET(req: NextRequest) {
  if (!SERPAPI_KEY) {
    return new Response(JSON.stringify({ error: "SerpApi key missing" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const params = new URLSearchParams(req.nextUrl.searchParams);
  params.set("api_key", SERPAPI_KEY);
  if (!params.has("engine")) params.set("engine", "google");
  if (!params.has("num")) params.set("num", "5");

  const url = `${SERPAPI_ENDPOINT}?${params.toString()}`;

  try {
    const upstream = await fetch(url, { cache: "no-store" });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error("SerpApi proxy failed", error);
    return new Response(JSON.stringify({ error: "upstream unavailable" }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
}
