import { PrismaClient } from '@pricelens/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { attachGroup, regroupListings } from '../src';
import { dbUrl, makeListing, makeSite, migrate, resetDb, runIntegration } from './helpers';

describe.skipIf(!runIntegration)('grouping (integration)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  beforeAll(() => migrate());
  beforeEach(() => resetDb(prisma));
  afterAll(async () => {
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  it('keeps 8/256 and 16/512 configurations of one model apart', async () => {
    const site = await makeSite(prisma);
    const ids = [];
    for (let i = 0; i < 3; i += 1) ids.push((await makeListing(prisma, site.id, { title: 'Dell Latitude 5490 i5-8350U 8GB 256GB', price: 9000 + i })).id);
    ids.push((await makeListing(prisma, site.id, { title: 'Dell Latitude 5490 i5-8350U 16GB 512GB', price: 12000 })).id);
    ids.push((await makeListing(prisma, site.id, { title: 'Dell Latitude 5490 i5-8350U', price: 8000 })).id);
    for (const id of ids) await attachGroup(prisma, id);
    const groups = await prisma.product.findMany({ include: { listings: true } });
    expect(groups.map((g) => g.listings.length).sort()).toEqual([1, 1, 3]);
  });

  it('regroup dry run reports, apply moves, manual decisions are kept', async () => {
    const site = await makeSite(prisma);
    const legion = await makeListing(prisma, site.id, { title: 'Lenovo Legion 5 Ryzen 5 5600H 16GB 512GB', price: 30000 });
    const manual = await makeListing(prisma, site.id, { title: 'Lenovo Legion 5 Ryzen 5 5600H 16GB 512GB', price: 31000 });
    const old = await prisma.product.create({
      data: { groupKey: 'lenovo|old|||', normalizedName: 'old', specs: { brand: 'Lenovo', model: 'Old' } },
    });
    await prisma.productListing.create({ data: { listingId: legion.id, productId: old.id, matchScore: 0.5, manual: false } });
    await prisma.productListing.create({ data: { listingId: manual.id, productId: old.id, matchScore: 1, manual: true } });
    const dry = await regroupListings(prisma, { dryRun: true });
    expect(dry).toMatchObject({ scanned: 2, manualKept: 1, wouldMove: 1, moved: 0 });
    expect((await prisma.productListing.findUnique({ where: { listingId: legion.id } }))!.productId).toBe(old.id);
    const applied = await regroupListings(prisma, { dryRun: false });
    expect(applied.moved).toBe(1);
    const moved = await prisma.productListing.findUnique({ where: { listingId: legion.id }, include: { product: true } });
    expect(moved!.product.normalizedName).toContain('Legion 5');
    expect((await prisma.productListing.findUnique({ where: { listingId: manual.id } }))!.productId).toBe(old.id);
  });
});
