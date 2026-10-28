import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SITE_CATALOG } from '@pricelens/shared';
import { describe, expect, it } from 'vitest';
import { applyFilters, extractListings, proposeHeal } from './extract';
import { googleSiteSearch } from './google';
import { looksBlockedPage } from './request';

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

  it('reads OLX listings from prerendered state when the card DOM is empty', () => {
    const state = {
      listing: {
        listing: {
          ads: [
            {
              id: 11,
              title: 'Ноутбук Lenovo ThinkPad',
              url: '/d/uk/obyavlenie/laptop-ID11.html',
              price: { regularPrice: { value: 15000, currencyCode: 'UAH' } },
              location: { cityName: 'Київ' },
              photos: [{ link: 'https://img.olx.ua/a.jpg' }],
            },
            {
              id: 12,
              title: 'Ноутбук Dell',
              url: '/d/uk/obyavlenie/laptop-ID12.html',
              price: { displayValue: '12 500 грн.' },
              location: { cityName: 'Львів' },
            },
          ],
        },
      },
    };
    const encoded = JSON.stringify(JSON.stringify(state));
    const html = `<html><body><script>window.__PRERENDERED_STATE__ = ${encoded};</script></body></html>`;
    const items = extractListings(html, { baseUrl: 'https://www.olx.ua/' });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ title: 'Ноутбук Lenovo ThinkPad', price: 15000, currency: 'UAH', location: 'Київ' });
    expect(items[0]?.url).toBe('https://www.olx.ua/d/uk/obyavlenie/laptop-ID11.html');
    expect(items[1]?.price).toBe(12500);
  });

  it('reads OLX cards by data-cy when there is no JSON-LD', () => {
    const card = (title: string, price: string, id: string) =>
      `<div data-cy="l-card"><a href="/d/uk/obyavlenie/${id}.html"><div data-cy="ad-card-title"><h4>${title}</h4></div><p data-testid="ad-price">${price}</p><p data-testid="location-date">Київ - Сьогодні о 12:00</p></a></div>`;
    const html = `<div data-testid="listing-grid">${card('Ноутбук 1', '10 000 грн.', 'a')}${card('Ноутбук 2', '11 000 грн.', 'b')}${card('Ноутбук 3', '12 000 грн.', 'c')}</div>`;
    const items = extractListings(html, { baseUrl: 'https://www.olx.ua/' });
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items[0]?.title).toContain('Ноутбук');
    expect(items[0]?.price).toBe(10000);
    expect(items[0]?.url).toContain('https://www.olx.ua/d/uk/obyavlenie/');
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
  it('reads the current OLX search page (prerendered state, Oct 2026)', () => {
    const html = readFileSync(path.join(__dirname, '..', 'snapshots', 'olx-live-2026-10.html'), 'utf8');
    const items = extractListings(html, { baseUrl: 'https://www.olx.ua/' });
    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({ title: 'Продам Xiaomi Mi Notebook у хорошому стані', price: 6000, currency: 'UAH', location: 'Львів' });
    expect(items.every((item) => item.url.startsWith('https://www.olx.ua/d/uk/obyavlenie/'))).toBe(true);
  });

  it('recognises block pages', () => {
    expect(looksBlockedPage('<H1>403 ERROR</H1>Request blocked. Generated by cloudfront (CloudFront)')).toBe(true);
    const html = readFileSync(path.join(__dirname, '..', 'snapshots', 'olx-live-2026-10.html'), 'utf8');
    expect(looksBlockedPage(html)).toBe(false);
  });
});
