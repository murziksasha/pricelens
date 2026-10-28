import { PrismaClient } from '@pricelens/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { attachGroup, loadRates, readSettings, refreshNbuRates, searchRows } from '../src';
import { dbUrl, makeListing, makeSite, makeUser, migrate, resetDb, runIntegration } from './helpers';

describe.skipIf(!runIntegration)('currency conversion (integration)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  beforeAll(() => migrate());
  beforeEach(() => resetDb(prisma));
  afterAll(() => prisma.$disconnect());

  const nbu = (rate: number) =>
    (async () =>
      new Response(JSON.stringify([{ cc: 'USD', rate, exchangedate: '28.10.2026' }, { cc: 'PLN', rate: 10, exchangedate: '28.10.2026' }]), {
        status: 200,
      })) as unknown as typeof fetch;

  it('stores NBU rates idempotently and loads them', async () => {
    expect(await refreshNbuRates(prisma, nbu(41))).toBe(1);
    expect(await refreshNbuRates(prisma, nbu(41.2))).toBe(1);
    expect(await prisma.exchangeRate.count()).toBe(1);
    const rates = await loadRates(prisma, await readSettings(prisma));
    expect(rates.USD).toBe(41.2);
    expect(rates.EUR).toBeUndefined();
  });

  it('scores a USD listing against UAH listings in UAH', async () => {
    await refreshNbuRates(prisma, nbu(41));
    const site = await makeSite(prisma);
    const user = await makeUser(prisma);
    const title = 'Dell Latitude 5490 i5-8350U 8GB 256GB SSD';
    const peers = [16000, 16400, 17000, 15800];
    const listings = [];
    for (const price of peers) listings.push(await makeListing(prisma, site.id, { title, price }));
    const usd = await makeListing(prisma, site.id, { title, price: 300, currency: 'USD', priceUah: null });
    for (const l of [...listings, usd]) await attachGroup(prisma, l.id);
    const search = await prisma.search.create({ data: { userId: user.id, query: 'latitude', filters: {}, siteIds: [site.id], status: 'complete' } });
    await prisma.searchResult.create({ data: { searchId: search.id, listingId: usd.id, rank: 1 } });
    const [row] = await searchRows(prisma, search.id);
    expect(row!.priceUah).toBe(12300);
    expect(row!.deal.median).toBe(16200);
    expect(row!.deal.label).toBe('deal');
  });
});
