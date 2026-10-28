import { extractListings, proposeHeal, type ListingDraft } from '@pricelens/adapters';

function escapeReg(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function encodedTokenForms(token: string): string[] {
  const encoded = encodeURIComponent(token);
  const lowerHex = encoded.replace(/%[0-9A-F]{2}/gi, (part) => part.toLowerCase());
  const upperHex = encoded.replace(/%[0-9A-F]{2}/gi, (part) => part.toUpperCase());
  return [...new Set([encoded, lowerHex, upperHex])].filter((form) => form !== token);
}

/** FR-CON-001: find the query parameter or path segment that carries the test token. */
export function detectQueryParam(pageUrl: string, token: string): string | null {
  const needle = token.trim();
  if (needle.length < 2) return null;
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return null;
  }
  for (const [key, value] of url.searchParams.entries()) {
    let decoded = value;
    try {
      decoded = decodeURIComponent(value);
    } catch {
      decoded = value;
    }
    if (decoded.toLowerCase().includes(needle.toLowerCase())) return key;
  }
  let path = url.pathname;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    path = url.pathname;
  }
  if (path.toLowerCase().includes(needle.toLowerCase())) return 'path';
  return null;
}

/** Replace a raw or percent-encoded probe word with `{query}`. */
export function replaceProbeToken(pageUrl: string, token: string): string | null {
  const needle = token.trim();
  if (needle.length < 2 || pageUrl.includes('{query}')) return pageUrl.includes('{query}') ? pageUrl : null;
  let next = pageUrl;
  let hit = false;
  if (next.toLowerCase().includes(needle.toLowerCase())) {
    next = next.replace(new RegExp(escapeReg(needle), 'gi'), '{query}');
    hit = true;
  }
  for (const form of encodedTokenForms(needle)) {
    if (!next.includes(form)) continue;
    next = next.replaceAll(form, '{query}');
    hit = true;
  }
  return hit ? next : null;
}

/** FR-CON-001 / FR-CON-010: results address in, search template out. */
export function templateFromResultsUrl(pageUrl: string, token: string): { template: string; param: string | null } {
  const url = pageUrl.trim();
  const needle = token.trim();
  if (!url) return { template: url, param: null };
  if (url.includes('{query}')) {
    const probe = needle.length >= 2 ? url.replaceAll('{query}', encodeURIComponent(needle)) : url;
    return { template: url, param: detectQueryParam(probe, needle) ?? 'query' };
  }
  const template = replaceProbeToken(url, needle);
  if (!template) return { template: url, param: null };
  return { template, param: detectQueryParam(url, needle) ?? 'query' };
}

/** Preview and health fetches must not request the literal `{query}` placeholder. */
export function expandSearchTemplate(template: string, token: string): string {
  const needle = token.trim();
  if (!template.includes('{query}') || needle.length < 1) return template;
  return template.replaceAll('{query}', encodeURIComponent(needle));
}

export function previewListings(html: string, baseUrl: string): ListingDraft[] {
  return extractListings(html, { baseUrl });
}

export function healFromHtml(html: string, css: string) {
  return proposeHeal(html, css);
}

export const CONSTRUCTOR_FIELDS = ['title', 'price', 'url', 'image', 'location', 'date', 'description'] as const;
export type ConstructorField = (typeof CONSTRUCTOR_FIELDS)[number];

/** Click mapping for the same-origin preview: the picker posts the clicked text. */
export function assignClickedValue(field: ConstructorField, sample: string) {
  if (field === 'price') return { field, strategy: { type: 'pattern', kind: 'price' }, sample };
  if (field === 'url') return { field, strategy: { type: 'relative', role: 'url' }, sample };
  return { field, strategy: { type: 'semantic', labels: [sample.slice(0, 40).toLowerCase()] }, sample };
}
