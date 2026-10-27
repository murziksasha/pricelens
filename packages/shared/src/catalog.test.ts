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
});
