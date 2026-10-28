import { describe, expect, it } from 'vitest';
import { buildSearchUrl, SITE_CATALOG } from './catalog';

describe('site catalogue FR-SITE-010', () => {
  it('ships 16 native adapters', () => {
    expect(SITE_CATALOG).toHaveLength(16);
    expect(new Set(SITE_CATALOG.map((s) => s.key)).size).toBe(16);
    expect(SITE_CATALOG.every((s) => s.mode === 'native' && s.urlTemplate.includes('{query}'))).toBe(true);
  });

  it('drops empty price placeholders from the search URL', () => {
    const url = buildSearchUrl('https://example.test/s?q={query}&min={price_min}&max={price_max}', {
      query: 'laptop',
      price_min: 1000,
      price_max: null,
    });
    expect(url).toBe('https://example.test/s?q=laptop&min=1000');
  });
  it('drops filter placeholders the caller did not supply (OLX template)', () => {
    const olx = SITE_CATALOG.find((site) => site.key === 'olx')!;
    expect(buildSearchUrl(olx.urlTemplate, { query: 'ноутбук', page: 1 })).toBe(
      'https://www.olx.ua/uk/list/q-%D0%BD%D0%BE%D1%83%D1%82%D0%B1%D1%83%D0%BA/?currency=UAH&page=1',
    );
    expect(buildSearchUrl(olx.urlTemplate, { query: 'x', price_min: 5000, page: 2 })).toBe(
      'https://www.olx.ua/uk/list/q-x/?currency=UAH&search%5Bfilter_float_price%3Afrom%5D=5000&page=2',
    );
  });

  it('keeps the earlier built-in URLs so old installs can be moved to the current ones', () => {
    for (const site of SITE_CATALOG) {
      expect(site.legacyTemplates ?? []).not.toContain(site.urlTemplate);
      expect(site.legacyDomains ?? []).not.toContain(site.domain);
    }
    const byKey = Object.fromEntries(SITE_CATALOG.map((site) => [site.key, site]));
    expect(byKey.rozetka!.urlTemplate).toContain('search.rozetka.com.ua');
    expect(byKey.rozetka!.useBrowser).toBe(false);
    expect(byKey.fua!.domain).toBe('epicentrk.ua');
    expect(byKey.fua!.legacyDomains).toEqual(['f.ua']);
    expect(buildSearchUrl(byKey.tex!.urlTemplate, { query: 'ноутбук', page: 1 })).toBe(
      'https://tex.ua/t/tovary?search%5Bwith_name_or_sku%5D=%D0%BD%D0%BE%D1%83%D1%82%D0%B1%D1%83%D0%BA',
    );
  });
});
