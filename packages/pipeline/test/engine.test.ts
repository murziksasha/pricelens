import { PrismaClient } from '@pricelens/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { drainQueuedSearches, refreshNbuRates, runSearch, searchProgress, searchRows } from '../src';
import { dbUrl, makeSite, makeUser, migrate, resetDb, runIntegration } from './helpers';

interface Item {
  title: string;
  path: string;
  price: number;
  currency?: string;
}

/** A marketplace page with schema.org Product blocks, which the extractor reads first. */
function page(items: Item[]) {
  const ld = items.map((item) => ({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: item.title,
    url: item.path,
    offers: { '@type': 'Offer', price: String(item.price), priceCurrency: item.currency ?? 'UAH', itemCondition: 'UsedCondition' },
  }));
  return `<html><body>${ld.map((node) => `<script type="application/ld+json">${JSON.stringify(node)}</script>`).join('')}</body></html>`;
}

const nbu = (async () =>
  new Response(JSON.stringify([{ cc: 'USD', rate: 41, exchangedate: '28.10.2026' }]), { status: 200 })) as unknown as typeof fetch;

describe.skipIf(!runIntegration)('search engine (integration)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  beforeAll(() => migrate());
  beforeEach(() => resetDb(prisma));
  afterAll(async () => {
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  async function search(siteIds: string[], html: Record<string, string>, query = 'thinkpad') {
    const user = (await prisma.user.findFirst()) ?? (await makeUser(prisma));
    const created = await prisma.search.create({ data: { userId: user.id, query, filters: {}, siteIds, status: 'running', refresh: true } });
    await runSearch(prisma, created.id, { load: async (site) => html[site.id] ?? '' });
    return created.id;
  }

  it('converts USD to UAH, scores against peers and labels the sale source', async () => {
    await refreshNbuRates(prisma, nbu);
    const site = await makeSite(prisma);
    const title = 'Lenovo ThinkPad T480 i5-8350U 16GB 512GB';
    const items: Item[] = [
      { title, path: '/a1', price: 12000 },
      { title, path: '/a2', price: 13000 },
      { title, path: '/a3', price: 14000 },
      { title, path: '/a4', price: 15000 },
      { title, path: '/usd', price: 250, currency: 'USD' },
    ];
    const id = await search([site.id], { [site.id]: page(items) });
    const rows = await searchRows(prisma, id);
    expect(rows).toHaveLength(5);
    const usd = rows.find((row) => row.url.endsWith('/usd'))!;
    expect(usd.priceUah).toBe(10250);
    expect(usd.deal.median).toBe(13500);
    expect(usd.deal.label).toBe('deal');
    expect(usd.expectedSource).toBe('asking_median');
    // 5.5: expected sale 13 500 − costs 0 − default margin 1 500
    expect(usd.buyBelow).toBe(12000);
    expect(usd.daysListed).toBe(0);
    expect(usd.sellerHint).toBeNull();
    expect((await searchProgress(prisma, id)).done).toBe(true);
  });

  it('keeps "for parts" listings out of the working median and prices them separately', async () => {
    const site = await makeSite(prisma);
    const title = 'Dell Latitude 7490 i5-8350U 16GB 256GB';
    const id = await search([site.id], {
      [site.id]: page([
        { title, path: '/w1', price: 14000 },
        { title, path: '/w2', price: 15000 },
        { title, path: '/w3', price: 16000 },
        { title, path: '/w4', price: 17000 },
        { title: `${title} на запчасти`, path: '/p1', price: 4000 },
        { title: `${title} не включается`, path: '/p2', price: 5000 },
      ]),
    });
    const rows = await searchRows(prisma, id);
    const working = rows.find((row) => row.url.endsWith('/w1'))!;
    expect(working.defects).toEqual([]);
    expect(working.deal.median).toBe(16000);
    expect(working.partsRange).toEqual({ min: 4000, max: 5000 });
    const broken = rows.find((row) => row.url.endsWith('/p1'))!;
    expect(broken.defects).toContain('parts');
    expect(broken.expectedSale).toBeNull();
  });

  it('marks a re-post on another site at ±3% but not at +20%', async () => {
    const first = await makeSite(prisma);
    const second = await makeSite(prisma);
    const title = 'HP EliteBook 840 G5 i5-8250U 8GB 256GB SSD';
    await search([first.id], { [first.id]: page([{ title, path: '/orig', price: 10000 }]) });
    await search([second.id], {
      [second.id]: page([
        { title, path: '/repost', price: 10300 },
        { title: `${title} `, path: '/pricier', price: 12000 },
      ]),
    });
    const dups = await prisma.duplicate.findMany({ include: { listing: true } });
    expect(dups.map((dup) => dup.listing.url).some((url) => url.endsWith('/repost'))).toBe(true);
    expect(dups.find((dup) => dup.listing.url.endsWith('/pricier'))).toBeUndefined();
    expect(dups.every((dup) => dup.reason === 'repost')).toBe(true);
  });

  it('marks a search that crashes as failed', async () => {
    const user = await makeUser(prisma);
    // An invalid site id makes Prisma throw inside runSearch (uuid column), i.e. a crash, not a site error.
    const queued = await prisma.search.create({ data: { userId: user.id, query: 'x', filters: {}, siteIds: ['not-a-uuid'], status: 'queued' } });
    await drainQueuedSearches(prisma, async () => '');
    const progress = await searchProgress(prisma, queued.id);
    expect(progress.status).toBe('failed');
    expect(progress.done).toBe(true);
    expect(progress.failed).toBe(true);
  });
});
