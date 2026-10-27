/** Trigram similarity used by duplicate detection (FR-VIS-003) and grouping (FR-GRP-004). */

export function trigrams(value: string): Set<string> {
  const padded = `  ${value.toLowerCase().trim()}  `;
  const set = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) set.add(padded.slice(i, i + 3));
  return set;
}

export function trigramSimilarity(a: string, b: string): number {
  const left = trigrams(a);
  const right = trigrams(b);
  if (left.size === 0 || right.size === 0) return 0;
  let inter = 0;
  for (const token of left) if (right.has(token)) inter++;
  const union = left.size + right.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase();
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function cacheKey(parts: {
  query: string;
  priceMin?: number | null;
  priceMax?: number | null;
  condition?: string | null;
  city?: string | null;
}): string {
  return [
    normalizeQuery(parts.query),
    parts.priceMin ?? '',
    parts.priceMax ?? '',
    (parts.condition ?? '').toLowerCase(),
    (parts.city ?? '').trim().toLowerCase(),
  ].join('|');
}

/** FR-SCH-004: a cached fetch newer than the site poll interval must be reused. */
export function cacheFresh(fetchedAt: Date, now: Date, pollIntervalMinutes: number): boolean {
  return now.getTime() - fetchedAt.getTime() < pollIntervalMinutes * 60_000;
}
