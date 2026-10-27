import type { ListingDraft } from './extract';

export interface GoogleConfig {
  apiKey?: string | null;
  cx?: string | null;
}

/** ADR-0001: optional Programmable Search fallback. Missing key is a reason, not a crash. */
export async function googleSiteSearch(
  config: GoogleConfig,
  domain: string,
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ items: ListingDraft[]; error?: string }> {
  if (!config.apiKey || !config.cx) return { items: [], error: 'google_key_missing' };
  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', config.apiKey);
  url.searchParams.set('cx', config.cx);
  url.searchParams.set('q', `site:${domain} ${query}`);
  const response = await fetchImpl(url);
  if (!response.ok) return { items: [], error: 'google_upstream_error' };
  const body = (await response.json()) as { items?: Array<{ title?: string; link?: string; snippet?: string }> };
  const items: ListingDraft[] = (body.items ?? [])
    .filter((item) => item.title && item.link)
    .map((item) => ({
      title: item.title!,
      url: item.link!,
      price: null,
      currency: null,
      description: item.snippet ?? null,
    }));
  return { items };
}
