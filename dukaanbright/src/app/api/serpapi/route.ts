import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const serpApiEndpoint = process.env.SERPAPI_API_ENDPOINT;
  const serpApiKey = process.env.SERPAPI_API_KEY || process.env.NEXT_PUBLIC_SERPAPI_KEY;

  if (!serpApiEndpoint) {
    return new Response(JSON.stringify({ error: "SerpApi endpoint missing" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (!serpApiKey) {
    return new Response(JSON.stringify({ error: "SerpApi key missing" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const params = new URLSearchParams(req.nextUrl.searchParams);
  params.set("api_key", serpApiKey);
  if (!params.has("engine")) params.set("engine", "google");
  if (!params.has("num")) params.set("num", "5");

  const url = `${serpApiEndpoint}?${params.toString()}`;

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
