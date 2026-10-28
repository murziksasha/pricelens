import * as cheerio from 'cheerio';
import { parsePostedAt } from './dates';
import { parseMoney } from './money';

export interface ListingDraft {
  title: string;
  price: number | null;
  currency: string | null;
  url: string;
  imageUrl?: string | null;
  location?: string | null;
  postedAt?: string | null;
  description?: string | null;
  externalId?: string | null;
  condition?: 'new' | 'used' | 'unknown';
  rawPrice?: string | null;
}

export interface ExtractOptions {
  baseUrl: string;
  currencyHint?: string | null;
  css?: Partial<Record<'title' | 'price' | 'url' | 'image' | 'location' | 'date', string>>;
}

const PRICE_LABELS = ['ціна', 'цена', 'price', 'вартість', 'стоимость'];
const PLACE_LABELS = ['місто', 'город', 'локація', 'локация', 'location', 'місце', 'место'];

function absUrl(base: string, href: string | undefined): string {
  if (!href) return '';
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function collectLd(raw: unknown, into: unknown[]) {
  if (!raw || typeof raw !== 'object') return;
  const node = raw as Record<string, unknown>;
  if (Array.isArray(raw)) {
    for (const item of raw) collectLd(item, into);
    return;
  }
  into.push(node);
  if (node['@graph']) collectLd(node['@graph'], into);
}

function productFromLd(node: Record<string, unknown>, baseUrl: string): ListingDraft | null {
  const type = String(node['@type'] ?? '');
  if (!/Product/i.test(type)) return null;
  const offers = asArray(node.offers as Record<string, unknown> | Record<string, unknown>[]);
  const offer = offers[0] ?? {};
  const priceRaw = offer.price ?? offer.lowPrice;
  const money = parseMoney(String(priceRaw ?? ''));
  const title = String(node.name ?? '').trim();
  const url = absUrl(baseUrl, String(node.url ?? ''));
  if (!title || !url) return null;
  const image = node.image;
  const imageUrl = typeof image === 'string' ? image : Array.isArray(image) ? String(image[0] ?? '') : null;
  return {
    title,
    price: money?.amount ?? (typeof priceRaw === 'number' ? priceRaw : null),
    currency: money?.currency ?? (offer.priceCurrency ? String(offer.priceCurrency) : null),
    url,
    imageUrl,
    description: node.description ? String(node.description) : null,
    externalId: node.sku ? String(node.sku) : null,
    condition: /used|б\/у|вжив/i.test(String(offer.itemCondition ?? '')) ? 'used' : 'unknown',
  };
}

export function listingsFromJsonLd(html: string, baseUrl: string): ListingDraft[] {
  const $ = cheerio.load(html);
  const nodes: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      collectLd(JSON.parse($(el).text()), nodes);
    } catch {
      /* ignore broken blocks */
    }
  });
  const drafts: ListingDraft[] = [];
  for (const node of nodes) {
    const record = node as Record<string, unknown>;
    const type = String(record['@type'] ?? '');
    if (/ItemList/i.test(type)) {
      for (const entry of asArray(record.itemListElement as Record<string, unknown>)) {
        const recordEntry = entry as Record<string, unknown>;
        const item = (recordEntry.item as Record<string, unknown>) ?? recordEntry;
        const draft = productFromLd(item, baseUrl);
        if (draft) drafts.push(draft);
      }
    } else {
      const draft = productFromLd(record, baseUrl);
      if (draft) drafts.push(draft);
    }
  }
  return drafts;
}

function ownText($: cheerio.CheerioAPI, el: any): string {
  return $(el)
    .clone()
    .children()
    .remove()
    .end()
    .text()
    .replace(/\s+/g, ' ')
    .trim();
}

function valueByLabel($: cheerio.CheerioAPI, root: cheerio.Cheerio<any>, labels: string[]): string | null {
  let found: string | null = null;
  root.find('*').each((_, el) => {
    if (found) return;
    const label = ownText($, el).replace(/:$/, '').toLowerCase();
    if (!labels.includes(label)) return;
    const next = $(el).next().text().replace(/\s+/g, ' ').trim();
    if (next) {
      found = next;
      return;
    }
    const parent = $(el).parent().text().replace(/\s+/g, ' ').trim();
    const stripped = parent.replace(new RegExp(label, 'i'), '').replace(/^[\s:.-]+/, '').trim();
    if (stripped) found = stripped;
  });
  return found;
}

function findCards($: cheerio.CheerioAPI): any[] {
  let best: any[] = [];
  let bestScore = 0;
  $('*').each((_, el) => {
    const parent = el.parent;
    if (!parent || !('children' in parent)) return;
    const tag = (el as { tagName?: string }).tagName;
    const siblings = (parent.children as any[]).filter(
      (child) => child.type === 'tag' && (child as { tagName?: string }).tagName === tag,
    );
    if (siblings.length < 3 || siblings.length < best.length) return;
    const good = siblings.filter((sibling) => {
      const node = $(sibling);
      const hasLink = node.find('a[href]').length > 0;
      const hasPrice = /(\d[\d\s]{1,12})\s*(грн|uah|₴|\$|usd|€|eur)/i.test(node.text());
      return hasLink && hasPrice;
    });
    if (good.length < 3) return;
    const avg = good.reduce((sum, node) => sum + $(node).text().length, 0) / good.length;
    if (avg < 15 || avg > 4000) return;
    const score = good.length * 1000 + avg;
    if (score > bestScore) {
      best = good;
      bestScore = score;
    }
  });
  return best;
}

function conditionFrom(text: string): 'new' | 'used' | 'unknown' {
  if (/б\/у|вжив|used|second hand/i.test(text)) return 'used';
  if (/новий|новый|\bnew\b/i.test(text)) return 'new';
  return 'unknown';
}

function draftFromCard($: cheerio.CheerioAPI, card: any, options: ExtractOptions): ListingDraft | null {
  const node = $(card);
  const link = options.css?.url
    ? node.find(options.css.url).first()
    : node.find('a[href]').filter((_, el) => $(el).text().trim().length > 0).first();
  const href = link.attr('href') ?? node.find('a[href]').first().attr('href');
  const url = absUrl(options.baseUrl, href);
  const titleNode = options.css?.title ? node.find(options.css.title).first() : link;
  const title = (titleNode.text() || link.text()).replace(/\s+/g, ' ').trim();
  if (!title || !url) return null;
  const priceText =
    (options.css?.price ? node.find(options.css.price).first().text() : '') ||
    valueByLabel($, node, PRICE_LABELS) ||
    node.text();
  const money = parseMoney(priceText);
  const image = options.css?.image
    ? node.find(options.css.image).attr('src')
    : node.find('img').attr('src');
  const location =
    (options.css?.location ? node.find(options.css.location).text() : '') ||
    valueByLabel($, node, PLACE_LABELS);
  const dateText = (options.css?.date ? node.find(options.css.date).text() : '') || node.find('time').text() || node.text();
  const posted = parsePostedAt(dateText);
  const externalId = node.attr('data-id') ?? null;
  return {
    title,
    price: money?.amount ?? null,
    currency: money?.currency ?? options.currencyHint ?? null,
    url,
    imageUrl: image ? absUrl(options.baseUrl, image) : null,
    location: location?.trim() || null,
    postedAt: posted ? posted.toISOString() : null,
    description: node.find('p').first().text().trim() || null,
    externalId,
    condition: conditionFrom(node.text()),
    rawPrice: priceText.trim().slice(0, 80),
  };
}

function priceFromAd(price: unknown): { amount: number | null; currency: string | null; raw: string | null } {
  if (typeof price === 'number') return { amount: price, currency: null, raw: String(price) };
  if (typeof price === 'string') {
    const money = parseMoney(price);
    return { amount: money?.amount ?? null, currency: money?.currency ?? null, raw: price };
  }
  if (!price || typeof price !== 'object') return { amount: null, currency: null, raw: null };
  const obj = price as Record<string, unknown>;
  const regular = obj.regularPrice;
  if (regular && typeof regular === 'object') {
    const record = regular as Record<string, unknown>;
    const amount = Number(record.value);
    return {
      amount: Number.isFinite(amount) ? amount : null,
      currency: record.currencyCode ? String(record.currencyCode) : null,
      raw: record.value == null ? null : String(record.value),
    };
  }
  const display = String(obj.displayValue ?? obj.label ?? obj.value ?? '');
  const money = parseMoney(display);
  return { amount: money?.amount ?? null, currency: money?.currency ?? (obj.currency ? String(obj.currency) : null), raw: display || null };
}

function locationFromAd(item: Record<string, unknown>): string | null {
  const loc = item.location ?? item.city;
  if (typeof loc === 'string') return loc;
  if (!loc || typeof loc !== 'object') return null;
  const record = loc as Record<string, unknown>;
  const city = record.cityName ?? record.city ?? record.name ?? record.pathName;
  return typeof city === 'string' ? city : null;
}

function imageFromAd(item: Record<string, unknown>): string | null {
  const photos = item.photos ?? item.images;
  const first = Array.isArray(photos) ? photos[0] : null;
  if (typeof first === 'string') return first;
  if (!first || typeof first !== 'object') return null;
  const photo = first as Record<string, unknown>;
  const link = photo.link ?? photo.url ?? photo.src;
  return typeof link === 'string' ? link.replace('{width}', '800').replace('{height}', '600') : null;
}

function draftFromAd(item: Record<string, unknown>, baseUrl: string): ListingDraft | null {
  const title = String(item.title ?? '').replace(/\s+/g, ' ').trim();
  const href = typeof item.url === 'string' ? item.url : '';
  const url = absUrl(baseUrl, href);
  const money = priceFromAd(item.price);
  if (!title || !url || money.amount == null) return null;
  const rawDate = item.lastRefreshTime ?? item.createdTime ?? item.created_at;
  let postedAt: string | null = null;
  if (typeof rawDate === 'string') {
    const parsed = Date.parse(rawDate);
    postedAt = Number.isNaN(parsed) ? (parsePostedAt(rawDate)?.toISOString() ?? null) : new Date(parsed).toISOString();
  }
  return {
    title,
    price: money.amount,
    currency: money.currency,
    url,
    imageUrl: imageFromAd(item),
    location: locationFromAd(item),
    postedAt,
    description: typeof item.description === 'string' ? item.description : null,
    externalId: item.id == null ? null : String(item.id),
    condition: 'unknown',
    rawPrice: money.raw,
  };
}

function collectAdArrays(node: unknown, into: Record<string, unknown>[], depth = 0) {
  if (!node || typeof node !== 'object' || depth > 8) return;
  if (Array.isArray(node)) {
    const ads = node.filter((item): item is Record<string, unknown> => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
      const record = item as Record<string, unknown>;
      return typeof record.title === 'string' && record.price != null && (typeof record.url === 'string' || record.id != null);
    });
    if (ads.length >= 1 && ads.length * 2 >= node.length) {
      into.push(...ads);
      return;
    }
    for (const item of node) collectAdArrays(item, into, depth + 1);
    return;
  }
  for (const value of Object.values(node as Record<string, unknown>)) collectAdArrays(value, into, depth + 1);
}

/** FR-CON-006: OLX (and similar shells) keep the list in prerendered JSON, not in the card DOM. */
export function listingsFromEmbeddedState(html: string, baseUrl: string): ListingDraft[] {
  const blobs: unknown[] = [];
  const match = html.match(/__PRERENDERED_STATE__\s*=\s*"((?:[^"\\]|\\.)*)"/);
  if (match?.[1]) {
    try {
      const decoded = JSON.parse(`"${match[1]}"`) as unknown;
      blobs.push(typeof decoded === 'string' ? JSON.parse(decoded) : decoded);
    } catch {
      /* ignore a broken state blob */
    }
  }
  const $ = cheerio.load(html);
  $('script#__NEXT_DATA__').each((_, el) => {
    try {
      blobs.push(JSON.parse($(el).text()));
    } catch {
      /* ignore */
    }
  });
  const ads: Record<string, unknown>[] = [];
  for (const blob of blobs) collectAdArrays(blob, ads);
  return ads.map((ad) => draftFromAd(ad, baseUrl)).filter((item): item is ListingDraft => Boolean(item));
}

/** FR-CON-006 semantic anchors used by OLX cards (`data-cy="l-card"`). */
export function listingsFromAnchors($: cheerio.CheerioAPI, options: ExtractOptions): ListingDraft[] {
  const drafts: ListingDraft[] = [];
  $('[data-cy="l-card"]').each((_, card) => {
    const node = $(card);
    const href = node.find('a[href]').first().attr('href');
    const url = absUrl(options.baseUrl, href);
    const title = (node.find('[data-cy="ad-card-title"]').text() || node.find('h1, h2, h3, h4, h5, h6').first().text())
      .replace(/\s+/g, ' ')
      .trim();
    const priceText = node.find('[data-testid="ad-price"]').text().replace(/\s+/g, ' ').trim();
    const money = parseMoney(priceText);
    if (!title || !url || money?.amount == null) return;
    const locationText = node.find('[data-testid="location-date"]').text().replace(/\s+/g, ' ').trim();
    const posted = parsePostedAt(locationText);
    const image = node.find('img').attr('src') || node.find('img').attr('data-src');
    drafts.push({
      title,
      price: money.amount,
      currency: money.currency ?? options.currencyHint ?? null,
      url,
      imageUrl: image ? absUrl(options.baseUrl, image) : null,
      location: locationText || null,
      postedAt: posted ? posted.toISOString() : null,
      description: null,
      externalId: node.attr('id') ?? null,
      condition: conditionFrom(node.text()),
      rawPrice: priceText,
    });
  });
  return drafts;
}

export function extractListings(html: string, options: ExtractOptions): ListingDraft[] {
  const fromLd = listingsFromJsonLd(html, options.baseUrl).filter((item) => item.title && item.url && item.price != null);
  if (fromLd.length >= 1 && !options.css) return dedupe(fromLd);
  const fromState = listingsFromEmbeddedState(html, options.baseUrl);
  const $ = cheerio.load(html);
  const fromAnchors = listingsFromAnchors($, options);
  const cards = findCards($);
  const fromCards = cards
    .map((card) => draftFromCard($, card, options))
    .filter((item): item is ListingDraft => Boolean(item && item.price != null));
  const ranked = [fromState, fromAnchors, fromCards, fromLd].sort((left, right) => right.length - left.length);
  return dedupe(ranked[0] ?? []);
}

function dedupe(items: ListingDraft[]): ListingDraft[] {
  const seen = new Set<string>();
  const out: ListingDraft[] = [];
  for (const item of items) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    out.push(item);
  }
  return out;
}

export interface HealProposal {
  field: 'price';
  strategy: { type: 'semantic'; labels: string[] } | { type: 'pattern'; kind: 'price' } | { type: 'jsonld' };
  sample: string;
}

/** FR-CON-007: when the stored CSS selector misses, propose the strategy that still hits. */
export function proposeHeal(html: string, brokenCss: string): HealProposal | null {
  const $ = cheerio.load(html);
  if ($(brokenCss).length > 0) return null;
  if (listingsFromJsonLd(html, 'https://example.test/').some((item) => item.price != null)) {
    return { field: 'price', strategy: { type: 'jsonld' }, sample: 'json-ld' };
  }
  const cards = findCards($);
  for (const card of cards) {
    const labeled = valueByLabel($, $(card), PRICE_LABELS);
    const money = labeled ? parseMoney(labeled) : null;
    if (money) {
      return { field: 'price', strategy: { type: 'semantic', labels: PRICE_LABELS }, sample: labeled! };
    }
    const pattern = $(card).text().match(/(\d[\d\s]{2,})\s*(грн|uah|₴)/i);
    if (pattern) {
      return { field: 'price', strategy: { type: 'pattern', kind: 'price' }, sample: pattern[0] };
    }
  }
  return null;
}

export function applyFilters<T extends { price: number | null; condition?: string; location?: string | null; postedAt?: string | null }>(
  items: T[],
  filters: { priceMin?: number | null; priceMax?: number | null; condition?: string | null; city?: string | null; dateFrom?: string | null },
): T[] {
  return items.filter((item) => {
    if (filters.priceMin != null && (item.price == null || item.price < filters.priceMin)) return false;
    if (filters.priceMax != null && (item.price == null || item.price > filters.priceMax)) return false;
    if (filters.condition && item.condition && item.condition !== 'unknown' && item.condition !== filters.condition) {
      return false;
    }
    if (filters.city && item.location && !item.location.toLowerCase().includes(filters.city.toLowerCase())) return false;
    if (filters.dateFrom && item.postedAt && item.postedAt < filters.dateFrom) return false;
    return true;
  });
}
