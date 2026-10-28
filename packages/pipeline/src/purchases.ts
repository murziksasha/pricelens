import type { PrismaClient } from '@pricelens/db';
import { allocateSale, fromKop, toKop, toUah, type Rates } from '@pricelens/shared';
import { audit, readSettings } from './engine';
import { loadRates } from './fx';

type Db = PrismaClient;
type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

function num(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && value && 'toNumber' in value) return (value as { toNumber: () => number }).toNumber();
  return Number(value);
}

function fail(code: string): never {
  throw Object.assign(new Error(code), { code });
}

export interface PurchaseItemInput {
  listingId: string;
  qty: number;
  unitPrice: number;
}

export interface PurchaseCreateInput {
  currency: string;
  purchasedAt?: string;
  note?: string;
  salePrice?: number | null;
  soldAt?: string | null;
  items: PurchaseItemInput[];
}

async function snapshotFor(tx: Tx, listingId: string) {
  const listing = await tx.listing.findUnique({ where: { id: listingId }, include: { grouped: true, site: true } });
  if (!listing) fail('not_found');
  return {
    listing,
    snapshot: { title: listing.title, specs: listing.specs, site: listing.site.name, url: listing.url, imageUrl: listing.imageUrl },
  };
}

/** Recomputes saleTotal / saleUnit / saleUnitUah for every position of a purchase from its sale TOTAL. */
export async function reallocateSale(tx: Tx, purchaseId: string, rates: Rates) {
  const purchase = await tx.purchase.findUnique({ where: { id: purchaseId }, include: { items: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } } });
  if (!purchase) fail('not_found');
  const salePriceUah = purchase.salePrice == null ? null : toUah(num(purchase.salePrice), purchase.currency, rates);
  await tx.purchase.update({ where: { id: purchaseId }, data: { salePriceUah } });
  if (purchase.salePrice == null) {
    await tx.purchaseItem.updateMany({
      where: { purchaseId },
      data: { saleTotal: null, saleUnit: null, saleUnitUah: null, allocMethod: null },
    });
    return;
  }
  const allocation = allocateSale(
    toKop(num(purchase.salePrice)),
    purchase.items.map((item) => ({
      id: item.id,
      qty: item.qty,
      unitBuyKop: toKop(num(item.unitPrice)),
      manualSaleKop: item.saleManual == null ? null : toKop(num(item.saleManual)),
    })),
  );
  for (const part of allocation) {
    const saleUnit = fromKop(part.saleUnitKop);
    await tx.purchaseItem.update({
      where: { id: part.id },
      data: {
        saleTotal: fromKop(part.saleTotalKop),
        saleUnit,
        saleUnitUah: toUah(saleUnit, purchase.currency, rates),
        allocMethod: part.method,
      },
    });
  }
}

export async function recordPurchase(prisma: Db, userId: string, input: PurchaseCreateInput) {
  const rates = await loadRates(prisma, await readSettings(prisma));
  const purchase = await prisma.$transaction(async (tx) => {
    const created = await tx.purchase.create({
      data: {
        userId,
        currency: input.currency,
        purchasedAt: input.purchasedAt ? new Date(input.purchasedAt) : new Date(),
        note: input.note,
        salePrice: input.salePrice ?? null,
        soldAt: input.soldAt ? new Date(input.soldAt) : null,
      },
    });
    for (const [position, item] of input.items.entries()) {
      const { listing, snapshot } = await snapshotFor(tx, item.listingId);
      await tx.purchaseItem.create({
        data: {
          purchaseId: created.id,
          position,
          listingId: listing.id,
          productGroupId: listing.grouped?.productId ?? null,
          qty: item.qty,
          unitPrice: item.unitPrice,
          unitPriceUah: toUah(item.unitPrice, input.currency, rates),
          listingSnapshot: snapshot,
        },
      });
      await tx.listingMark.upsert({
        where: { listingId: listing.id },
        create: { listingId: listing.id, status: 'bought', updatedBy: userId },
        update: { status: 'bought', updatedBy: userId },
      });
    }
    await reallocateSale(tx, created.id, rates);
    return created;
  });
  return getPurchase(prisma, purchase.id);
}

export interface PurchasePatchInput {
  salePrice?: number | null;
  soldAt?: string | null;
  note?: string;
  items?: Array<{ id: string; qty?: number; unitPrice?: number; saleManual?: number | null }>;
}

export async function updatePurchase(prisma: Db, id: string, input: PurchasePatchInput) {
  const rates = await loadRates(prisma, await readSettings(prisma));
  await prisma.$transaction(async (tx) => {
    const current = await tx.purchase.findUnique({ where: { id }, include: { items: true } });
    if (!current) fail('not_found');
    await tx.purchase.update({
      where: { id },
      data: {
        salePrice: input.salePrice === undefined ? undefined : input.salePrice,
        soldAt: input.soldAt === undefined ? undefined : input.soldAt ? new Date(input.soldAt) : null,
        note: input.note,
      },
    });
    for (const patch of input.items ?? []) {
      const item = current.items.find((row) => row.id === patch.id);
      if (!item) fail('not_found');
      await tx.purchaseItem.update({
        where: { id: item.id },
        data: {
          qty: patch.qty,
          unitPrice: patch.unitPrice,
          unitPriceUah: patch.unitPrice === undefined ? undefined : toUah(patch.unitPrice, current.currency, rates),
          saleManual: patch.saleManual === undefined ? undefined : patch.saleManual,
        },
      });
    }
    await reallocateSale(tx, id, rates);
  });
  return getPurchase(prisma, id);
}

export async function addPurchaseItem(prisma: Db, purchaseId: string, item: PurchaseItemInput) {
  const rates = await loadRates(prisma, await readSettings(prisma));
  await prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.findUnique({ where: { id: purchaseId } });
    if (!purchase) fail('not_found');
    const { listing, snapshot } = await snapshotFor(tx, item.listingId);
    const last = await tx.purchaseItem.findFirst({ where: { purchaseId }, orderBy: { position: 'desc' } });
    await tx.purchaseItem.create({
      data: {
        purchaseId,
        position: (last?.position ?? -1) + 1,
        listingId: listing.id,
        productGroupId: listing.grouped?.productId ?? null,
        qty: item.qty,
        unitPrice: item.unitPrice,
        unitPriceUah: toUah(item.unitPrice, purchase.currency, rates),
        listingSnapshot: snapshot,
      },
    });
    await reallocateSale(tx, purchaseId, rates);
  });
  return getPurchase(prisma, purchaseId);
}

export async function removePurchaseItem(prisma: Db, purchaseId: string, itemId: string) {
  const rates = await loadRates(prisma, await readSettings(prisma));
  await prisma.$transaction(async (tx) => {
    const count = await tx.purchaseItem.count({ where: { purchaseId } });
    if (count <= 1) fail('last_position');
    const deleted = await tx.purchaseItem.deleteMany({ where: { id: itemId, purchaseId } });
    if (deleted.count === 0) fail('not_found');
    await reallocateSale(tx, purchaseId, rates);
  });
  return getPurchase(prisma, purchaseId);
}

type PurchaseWithItems = NonNullable<Awaited<ReturnType<typeof loadPurchase>>>;

function loadPurchase(prisma: Db, id: string) {
  return prisma.purchase.findUnique({ where: { id }, include: { items: { orderBy: [{ position: 'asc' }, { id: 'asc' }] }, user: true } });
}

/** API shape: header totals plus per-position buy/sale per unit and margins. */
export function presentPurchase(row: PurchaseWithItems) {
  const items = row.items.map((item) => {
    const qty = item.qty;
    const unitPrice = num(item.unitPrice);
    const saleTotal = item.saleTotal == null ? null : num(item.saleTotal);
    const saleUnit = item.saleUnit == null ? null : num(item.saleUnit);
    const snapshot = (item.listingSnapshot ?? {}) as { title?: string; site?: string; url?: string };
    return {
      id: item.id,
      listingId: item.listingId,
      productGroupId: item.productGroupId,
      title: snapshot.title ?? '',
      site: snapshot.site ?? null,
      url: snapshot.url ?? null,
      qty,
      unitPrice,
      buyTotal: Math.round(unitPrice * qty * 100) / 100,
      saleManual: item.saleManual == null ? null : num(item.saleManual),
      saleTotal,
      saleUnit,
      allocMethod: item.allocMethod,
      marginUnit: saleUnit == null ? null : Math.round((saleUnit - unitPrice) * 100) / 100,
      margin: saleTotal == null ? null : Math.round((saleTotal - unitPrice * qty) * 100) / 100,
    };
  });
  const buyTotal = Math.round(items.reduce((sum, item) => sum + item.buyTotal, 0) * 100) / 100;
  const saleTotal = row.salePrice == null ? null : num(row.salePrice);
  return {
    id: row.id,
    currency: row.currency,
    purchasedAt: row.purchasedAt,
    soldAt: row.soldAt,
    note: row.note,
    userId: row.userId,
    buyer: row.user ? row.user.login : null,
    buyTotal,
    saleTotal,
    margin: saleTotal == null ? null : Math.round((saleTotal - buyTotal) * 100) / 100,
    units: items.reduce((sum, item) => sum + item.qty, 0),
    items,
  };
}

export async function getPurchase(prisma: Db, id: string) {
  const row = await loadPurchase(prisma, id);
  if (!row) fail('not_found');
  return presentPurchase(row);
}

export async function listPurchases(prisma: Db, filter: { buyer?: string }) {
  const rates = await loadRates(prisma, await readSettings(prisma));
  const rows = await prisma.purchase.findMany({
    where: filter.buyer ? { userId: filter.buyer } : {},
    include: { items: { orderBy: [{ position: 'asc' }, { id: 'asc' }] }, user: true },
    orderBy: { purchasedAt: 'desc' },
  });
  const items = rows.map(presentPurchase);
  const total = items.reduce((sum, row) => sum + (toUah(row.buyTotal, row.currency, rates) ?? 0), 0);
  return { items, total: Math.round(total * 100) / 100, currency: 'UAH' };
}

export async function auditPurchase(prisma: Db, actorId: string, action: string, id: string, meta?: object) {
  await audit(prisma, actorId, action, 'purchase', id, meta);
}

/** Fills UAH columns on purchases/items created before rates were known. */
export async function backfillPurchaseUah(prisma: Db, rates: Rates) {
  const items = await prisma.purchaseItem.findMany({
    where: { OR: [{ unitPriceUah: null }, { saleUnit: { not: null }, saleUnitUah: null }] },
    include: { purchase: true },
  });
  for (const item of items) {
    await prisma.purchaseItem.update({
      where: { id: item.id },
      data: {
        unitPriceUah: toUah(num(item.unitPrice), item.purchase.currency, rates),
        saleUnitUah: item.saleUnit == null ? null : toUah(num(item.saleUnit), item.purchase.currency, rates),
      },
    });
  }
  const headers = await prisma.purchase.findMany({ where: { salePrice: { not: null }, salePriceUah: null } });
  for (const row of headers) {
    await prisma.purchase.update({ where: { id: row.id }, data: { salePriceUah: toUah(num(row.salePrice), row.currency, rates) } });
  }
  return { items: items.length, purchases: headers.length };
}
