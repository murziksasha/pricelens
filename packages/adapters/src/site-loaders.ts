import { h2fetch } from './h2fetch';
import type { ListingDraft } from './extract';

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 PriceLens';

const ROZETKA_SEARCH_HOST = 'search.rozetka.com.ua';
const ROZETKA_PRODUCT_API = 'https://product-api.rozetka.com.ua/v4/goods/get-main';

/** True when the fetched page is only a list of ids and needs a second step (see expandSearchPage). */
export function needsExpansion(url: string): boolean {
  try {
    return new URL(url).hostname === ROZETKA_SEARCH_HOST;
  } catch {
    return false;
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await fn(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

interface RozetkaProduct {
  id?: number | string;
  title?: string;
  price?: number | string;
  href?: string;
  sell_status?: string;
  state?: string;
  images?: Array<{ preview?: { url?: string }; original?: { url?: string } }>;
}

/**
 * Rozetka's search page is an Angular shell; its search API returns only goods ids. Ask the
 * product API for the first `limit` of them and return them in the prepared format that
 * extractListings reads directly.
 */
async function expandRozetka(body: string, fetchImpl: FetchLike, limit: number): Promise<string> {
  let ids: string[] = [];
  try {
    const parsed = JSON.parse(body) as { data?: { goods?: Array<{ id?: number | string }> } };
    ids = (parsed.data?.goods ?? []).map((item) => String(item.id ?? '')).filter((id) => /^\d+$/.test(id));
  } catch {
    return body;
  }
  const products = await mapLimit(ids.slice(0, limit), 6, async (id): Promise<RozetkaProduct | null> => {
    try {
      const url = `${ROZETKA_PRODUCT_API}?front-type=xl&country=UA&lang=ua&goodsId=${id}`;
      const response = await fetchImpl(url, {
        headers: { 'user-agent': UA, accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) return null;
      const json = (await response.json()) as { data?: RozetkaProduct };
      return json.data ?? null;
    } catch {
      return null;
    }
  });
  const listings: ListingDraft[] = [];
  for (const product of products) {
    if (!product?.title || !product.href) continue;
    if (product.sell_status && /unavailable|archive|out_of_stock/.test(product.sell_status)) continue;
    const price = Number(product.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    const image = product.images?.[0]?.preview?.url ?? product.images?.[0]?.original?.url ?? null;
    listings.push({
      title: product.title,
      price,
      currency: 'UAH',
      url: product.href,
      imageUrl: image,
      location: null,
      postedAt: null,
      description: null,
      externalId: product.id == null ? null : String(product.id),
      condition: product.state === 'used' || product.state === 'refurbished' ? 'used' : product.state === 'new' ? 'new' : 'unknown',
      rawPrice: String(product.price),
    });
  }
  return JSON.stringify({ pricelensListings: listings });
}

/** Second fetch step for sites whose search endpoint returns ids, not listings. */
export async function expandSearchPage(
  url: string,
  body: string,
  opts: { fetchImpl?: FetchLike; limit?: number } = {},
): Promise<string> {
  if (!needsExpansion(url)) return body;
  return expandRozetka(body, opts.fetchImpl ?? h2fetch, opts.limit ?? 24);
}
