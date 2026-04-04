export type ScanSource = "openfoodfacts" | "serpapi";

export interface ScannedProduct {
  barcode: string;
  name: string;
  category: string;
  brand?: string;
  imageUrl?: string;
  price?: number;
  currency?: string;
  description?: string;
  source: ScanSource;
  referenceUrls?: string[];
}

interface OpenFoodFactsResponse {
  status: number;
  product?: {
    product_name?: string;
    product_name_en?: string;
    generic_name?: string;
    brands?: string;
    image_url?: string;
    categories_tags?: string[];
    price?: string | number;
    price_currency?: string;
  };
}

interface GoogleResult {
  title: string;
  url: string;
  snippet?: string;
}

interface SerpApiResponse {
  error?: string;
  search_metadata?: {
    status?: string;
  };
  organic_results?: Array<{
    title?: string;
    link?: string;
    snippet?: string;
  }>;
}

export interface AggregatedProductResult {
  resolved: ScannedProduct | null;
  sources: {
    openFoodFacts?: ScannedProduct | null;
    serpapi?: ScannedProduct | null;
  };
}

const OPENFOODFACTS_BASE = "/api/openfoodfacts";
const SERPAPI_BASE = "/api/serpapi";

function normalizeCategory(categoryTag?: string): string {
  if (!categoryTag) return "Uncategorized";
  const cleanedTag = categoryTag.includes(":") ? categoryTag.split(":")[1] : categoryTag;
  return cleanedTag.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function parsePrice(rawPrice?: string | number): number | undefined {
  if (rawPrice === undefined || rawPrice === null) return undefined;
  const numericPrice = Number(rawPrice);
  if (Number.isNaN(numericPrice)) return undefined;
  return Number(numericPrice.toFixed(2));
}

function cleanTitle(rawTitle: string): string {
  return rawTitle
    .replace(/\s*[|\-]\s*(amazon|flipkart|bigbasket|blinkit|instamart|jiomart).*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function inferBrand(title: string): string | undefined {
  const firstPart = title.split(/[|\-]/)[0]?.trim();
  if (!firstPart) return undefined;
  const words = firstPart.split(" ").filter(Boolean);
  if (words.length === 0) return undefined;
  return words.slice(0, 2).join(" ");
}

function inferCategoryFromText(text: string): string {
  const lower = text.toLowerCase();
  if (/(milk|cheese|butter|yogurt|paneer|dairy)/.test(lower)) return "Dairy";
  if (/(chips|biscuit|cookies|snack|namkeen|chocolate)/.test(lower)) return "Snacks";
  if (/(cola|juice|drink|beverage|soda|water)/.test(lower)) return "Beverages";
  if (/(rice|atta|flour|dal|lentil|grain|pasta)/.test(lower)) return "Grocery";
  if (/(soap|shampoo|toothpaste|detergent|cleaner)/.test(lower)) return "Household";
  if (/(tablet|capsule|syrup|medicine|pharma)/.test(lower)) return "Medicine";
  return "Uncategorized";
}

async function searchGoogleTopResults(query: string, maxResults = 5): Promise<GoogleResult[]> {
  const params = new URLSearchParams({ q: query, num: String(maxResults) });
  const response = await fetch(`${SERPAPI_BASE}?${params.toString()}`, { cache: "no-store" });

  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as SerpApiResponse;
  if (data.error || data.search_metadata?.status === "Error") {
    return [];
  }

  const collected: GoogleResult[] = [];
  const seen = new Set<string>();

  for (const item of data.organic_results || []) {
    const title = item.title?.trim();
    const url = item.link?.trim();
    const snippet = item.snippet?.trim();
    if (!title || !url) continue;
    if (/google\.|webcache\.googleusercontent|accounts\.google|support\.google/i.test(url)) continue;
    if (seen.has(url)) continue;

    seen.add(url);
    collected.push({ title, url, snippet });

    if (collected.length >= maxResults * 2) break;
  }

  return collected;
}

async function lookupProductViaSerpApi(barcode: string): Promise<ScannedProduct | null> {
  const results = await searchGoogleTopResults(barcode, 5);
  if (results.length === 0) return null;

  const primaryTitle = cleanTitle(results[0].title);
  const searchContext = results.map((result) => `${result.title} ${result.snippet || ""}`).join(" ");

  return {
    barcode,
    name: primaryTitle || `Product ${barcode}`,
    category: inferCategoryFromText(searchContext),
    brand: inferBrand(primaryTitle),
    description: `Inferred from top ${Math.min(results.length, 5)} search results.`,
    source: "serpapi",
    referenceUrls: results.slice(0, 5).map((result) => result.url),
  };
}

export async function lookupProductByBarcode(barcode: string): Promise<ScannedProduct | null> {
  const response = await fetch(`${OPENFOODFACTS_BASE}?barcode=${encodeURIComponent(barcode)}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Unable to connect to Open Food Facts right now.");
  }

  const data = (await response.json()) as OpenFoodFactsResponse;
  if (data.status !== 1 || !data.product) {
    return null;
  }

  const product = data.product;
  const name = product.product_name || product.product_name_en || product.generic_name;
  if (!name) {
    return null;
  }

  return {
    barcode,
    name,
    category: normalizeCategory(product.categories_tags?.[0]),
    brand: product.brands,
    imageUrl: product.image_url,
    price: parsePrice(product.price),
    currency: product.price_currency,
    source: "openfoodfacts",
  };
}

export async function lookupProductAggregated(barcode: string): Promise<AggregatedProductResult> {
  const openFoodFacts = await lookupProductByBarcode(barcode).catch(() => null);
  const serpapi = openFoodFacts ? null : await lookupProductViaSerpApi(barcode).catch(() => null);

  if (!openFoodFacts && !serpapi) {
    return { resolved: null, sources: { openFoodFacts, serpapi } };
  }

  if (openFoodFacts) {
    return { resolved: openFoodFacts, sources: { openFoodFacts, serpapi } };
  }

  return { resolved: serpapi, sources: { openFoodFacts, serpapi } };
}

export async function lookupProductByBarcodeWithFallback(barcode: string): Promise<ScannedProduct | null> {
  const aggregated = await lookupProductAggregated(barcode);
  return aggregated.resolved;
}
