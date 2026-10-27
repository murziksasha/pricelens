import { SITE_CATALOG, buildSearchUrl } from '@pricelens/shared';
import { describe, expect, it } from 'vitest';
import { extractListings } from './extract';
import { RequestLayer } from './request';

const live = process.env.RUN_LIVE === '1';

describe.skipIf(!live)('live contracts FR-REL-001', () => {
  const layer = new RequestLayer();
  it.each(SITE_CATALOG.map((site) => [site.key] as const))('%s returns a listing for ноутбук', async (key) => {
    const site = SITE_CATALOG.find((item) => item.key === key)!;
    const url = buildSearchUrl(site.urlTemplate, { query: 'ноутбук', page: 1 });
    const page = await layer.getText(
      { id: site.key, maxConcurrency: site.maxConcurrency, minDelayMs: site.minDelayMs },
      url,
    );
    const items = extractListings(page.text, { baseUrl: `https://${site.domain}/` });
    expect(items.length).toBeGreaterThanOrEqual(1);
  }, 60_000);
});
