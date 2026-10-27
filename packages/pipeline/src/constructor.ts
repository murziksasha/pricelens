import { extractListings, proposeHeal, type ListingDraft } from '@pricelens/adapters';

/** FR-CON-001: find the query parameter that carries the test token. */
export function detectQueryParam(pageUrl: string, token: string): string | null {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return null;
  }
  for (const [key, value] of url.searchParams.entries()) {
    if (value.toLowerCase().includes(token.toLowerCase())) return key;
  }
  const path = decodeURIComponent(url.pathname);
  if (path.toLowerCase().includes(token.toLowerCase())) return 'path';
  return null;
}

export function previewListings(html: string, baseUrl: string): ListingDraft[] {
  return extractListings(html, { baseUrl });
}

export function healFromHtml(html: string, css: string) {
  return proposeHeal(html, css);
}

const FIELDS = ['title', 'price', 'url', 'image', 'location', 'date', 'description'] as const;
export type ConstructorField = (typeof FIELDS)[number];

/** Click mapping for the same-origin preview: the picker posts the clicked text. */
export function assignClickedValue(field: ConstructorField, sample: string) {
  if (field === 'price') return { field, strategy: { type: 'pattern', kind: 'price' }, sample };
  if (field === 'url') return { field, strategy: { type: 'relative', role: 'url' }, sample };
  return { field, strategy: { type: 'semantic', labels: [sample.slice(0, 40).toLowerCase()] }, sample };
}
