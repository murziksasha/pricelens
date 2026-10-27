import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SITE_CATALOG } from '@pricelens/shared';
import { describe, expect, it } from 'vitest';
import { applyFilters, extractListings, proposeHeal } from './extract';
import { googleSiteSearch } from './google';

describe('extraction engine ADR-0002', () => {
  it('reads JSON-LD and card fields', () => {
    const html = readFileSync(path.join(__dirname, '..', 'snapshots', 'olx.html'), 'utf8');
    const items = extractListings(html, { baseUrl: 'https://www.olx.ua/' });
    expect(items.length).toBeGreaterThanOrEqual(10);
    expect(items.every((item) => item.title && item.price && item.url)).toBe(true);
  });

  it('still extracts after classes and ids are renamed and JSON-LD is removed', () => {
    const html = readFileSync(path.join(__dirname, '..', 'snapshots', 'prom.html'), 'utf8')
      .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '')
      .replaceAll('offer-card', 'x-block')
      .replaceAll('price-value', 'n-val')
      .replaceAll('class="ttl"', 'class="z"')
      .replaceAll('data-id', 'data-x');
    const items = extractListings(html, { baseUrl: 'https://prom.ua/' });
    expect(items.length).toBeGreaterThanOrEqual(10);
    expect(items[0]?.price).toBeGreaterThan(0);
    expect(items[0]?.location).toBeTruthy();
    expect(items[0]?.postedAt).toBeTruthy();
  });

  it('proposes a semantic strategy when the CSS selector is dead', () => {
    const html = readFileSync(path.join(__dirname, '..', 'snapshots', 'brain.html'), 'utf8')
      .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '')
      .replaceAll('price-value', 'moved');
    const proposal = proposeHeal(html, '.price-value');
    expect(proposal?.strategy.type).toBe('semantic');
    const items = extractListings(html, { baseUrl: 'https://brain.com.ua/' });
    expect(items[0]?.price).toBeGreaterThan(0);
  });

  it('applies a price range on the client', () => {
    const items = [
      { price: 100, condition: 'used' },
      { price: 500, condition: 'used' },
      { price: 2000, condition: 'new' },
    ];
    expect(applyFilters(items, { priceMin: 200, priceMax: 800 }).map((item) => item.price)).toEqual([500]);
  });
});

describe('snapshot contract FR-REL-005', () => {
  it.each(SITE_CATALOG.map((site) => [site.key, site.domain] as const))(
    '%s snapshot yields 10 priced listings',
    (key, domain) => {
      const html = readFileSync(path.join(__dirname, '..', 'snapshots', `${key}.html`), 'utf8');
      const items = extractListings(html, { baseUrl: `https://${domain}/` });
      expect(items.length).toBeGreaterThanOrEqual(10);
      expect(items.every((item) => item.title && item.price && item.price > 0 && item.url.startsWith('http'))).toBe(true);
    },
  );
});

describe('GoogleFallbackProvider ADR-0001', () => {
  it('reports a missing key instead of throwing', async () => {
    const result = await googleSiteSearch({}, 'olx.ua', 'laptop', async () => {
      throw new Error('should not fetch');
    });
    expect(result.error).toBe('google_key_missing');
  });

  it('maps programmable search items', async () => {
    const result = await googleSiteSearch({ apiKey: 'k', cx: 'cx' }, 'example.ua', 'laptop', async () =>
      new Response(JSON.stringify({ items: [{ title: 'Row', link: 'https://example.ua/a' }] }), { status: 200 }),
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.url).toContain('example.ua');
  });
});
