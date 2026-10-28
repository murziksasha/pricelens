import { PrismaClient } from '@pricelens/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addPurchaseItem, attachGroup, listPurchases, recordPurchase, removePurchaseItem, searchRows, updatePurchase } from '../src';
import { dbUrl, makeListing, makeSite, makeUser, migrate, resetDb, runIntegration } from './helpers';

describe.skipIf(!runIntegration)('purchases with positions (integration)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  beforeAll(() => migrate());
  beforeEach(() => resetDb(prisma));
  afterAll(async () => {
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  async function lot() {
    const site = await makeSite(prisma);
    const user = await makeUser(prisma);
    const t480 = await makeListing(prisma, site.id, { title: 'Lenovo ThinkPad T480 i5-8350U 8/256', price: 8000 });
    const mac = await makeListing(prisma, site.id, { title: 'MacBook Air M1 8/256', price: 14000 });
    return { user, t480, mac };
  }

  it('splits a sale total proportionally to buy cost and shows per-unit prices', async () => {
    const { user, t480, mac } = await lot();
    const created = await recordPurchase(prisma, user.id, {
      currency: 'UAH',
      items: [
        { listingId: t480.id, qty: 2, unitPrice: 8000 },
        { listingId: mac.id, qty: 1, unitPrice: 14000 },
      ],
    });
    expect(created.buyTotal).toBe(30000);
    expect(created.units).toBe(3);
    const sold = await updatePurchase(prisma, created.id, { salePrice: 45000, soldAt: '2026-10-28T10:00:00Z' });
    expect(sold.items.map((i) => [i.saleTotal, i.saleUnit, i.allocMethod])).toEqual([
      [24000, 12000, 'proportional'],
      [21000, 21000, 'proportional'],
    ]);
    expect(sold.margin).toBe(15000);
    const items = await prisma.purchaseItem.findMany({ orderBy: { position: 'asc' } });
    expect(items.map((i) => Number(i.saleUnitUah)).sort()).toEqual([12000, 21000]);
    expect((await prisma.listingMark.findUnique({ where: { listingId: mac.id } }))?.status).toBe('bought');
  });

  it('keeps a manual position amount and reallocates the rest; rejects manual > total', async () => {
    const { user, t480, mac } = await lot();
    const created = await recordPurchase(prisma, user.id, {
      currency: 'UAH',
      salePrice: 45000,
      items: [
        { listingId: t480.id, qty: 2, unitPrice: 8000 },
        { listingId: mac.id, qty: 1, unitPrice: 14000 },
      ],
    });
    const macItem = created.items.find((i) => i.title.startsWith('MacBook'))!;
    const updated = await updatePurchase(prisma, created.id, { items: [{ id: macItem.id, saleManual: 25000 }] });
    const byTitle = Object.fromEntries(updated.items.map((i) => [i.title.split(' ')[0], i]));
    expect(byTitle.MacBook!.saleTotal).toBe(25000);
    expect(byTitle.MacBook!.allocMethod).toBe('manual');
    expect(byTitle.Lenovo!.saleUnit).toBe(10000);
    await expect(updatePurchase(prisma, created.id, { salePrice: 20000 })).rejects.toMatchObject({ code: 'manual_exceeds_total' });
  });

  it('single position: per-unit = total / qty; add and remove positions', async () => {
    const { user, t480, mac } = await lot();
    const created = await recordPurchase(prisma, user.id, {
      currency: 'UAH',
      salePrice: 30000,
      items: [{ listingId: t480.id, qty: 2, unitPrice: 8000 }],
    });
    expect(created.items[0]).toMatchObject({ saleUnit: 15000, allocMethod: 'single' });
    const added = await addPurchaseItem(prisma, created.id, { listingId: mac.id, qty: 1, unitPrice: 14000 });
    expect(added.items).toHaveLength(2);
    expect(added.items.every((i) => i.allocMethod === 'proportional')).toBe(true);
    const removed = await removePurchaseItem(prisma, created.id, added.items.find((i) => i.title.startsWith('MacBook'))!.id);
    expect(removed.items[0]).toMatchObject({ saleUnit: 15000, allocMethod: 'single' });
    await expect(removePurchaseItem(prisma, created.id, removed.items[0]!.id)).rejects.toMatchObject({ code: 'last_position' });
    const list = await listPurchases(prisma, {});
    expect(list.total).toBe(16000);
  });

  it('feeds per-unit sale prices into the expected sale price of the group', async () => {
    const { user, t480 } = await lot();
    const site = await prisma.site.findFirstOrThrow();
    const title = 'Lenovo ThinkPad T480 i5-8350U 8/256';
    const peers = [];
    for (const price of [9000, 9500, 10000]) peers.push(await makeListing(prisma, site.id, { title, price }));
    for (const l of [t480, ...peers]) await attachGroup(prisma, l.id);
    await recordPurchase(prisma, user.id, {
      currency: 'UAH',
      salePrice: 26000,
      soldAt: new Date().toISOString(),
      items: [{ listingId: t480.id, qty: 2, unitPrice: 8000 }],
    });
    const search = await prisma.search.create({ data: { userId: user.id, query: 't480', filters: {}, siteIds: [site.id], status: 'complete' } });
    await prisma.searchResult.create({ data: { searchId: search.id, listingId: peers[0]!.id, rank: 1 } });
    const [row] = await searchRows(prisma, search.id);
    expect(row!.expectedSource).toBe('own_sales');
    expect(row!.expectedSamples).toBe(2);
    expect(row!.expectedSale).toBe(13000);
    expect(row!.profit).toBe(4000);
  });
});
