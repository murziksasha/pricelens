/** One-off: fill listings.price_uah for rows priced in USD/EUR. Safe to re-run. */
import { PrismaClient } from '@pricelens/db';
import { toUah } from '@pricelens/shared';
import { readSettings } from '../engine';
import { loadRates, refreshNbuRates } from '../fx';
import { backfillPurchaseUah } from '../purchases';

async function main() {
  const prisma = new PrismaClient();
  await refreshNbuRates(prisma).catch((error) => console.warn('nbu refresh failed, using stored/manual rates', error));
  const rates = await loadRates(prisma, await readSettings(prisma));
  console.log('rates', rates);
  let updated = 0;
  let skipped = 0;
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.listing.findMany({
      where: { priceUah: null },
      orderBy: { id: 'asc' },
      take: 500,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      const value = toUah(Number(row.price), row.currency, rates);
      if (value == null) skipped += 1;
      else {
        await prisma.listing.update({ where: { id: row.id }, data: { priceUah: value } });
        updated += 1;
      }
    }
    cursor = rows[rows.length - 1]!.id;
  }
  console.log(`price_uah backfill: updated ${updated}, skipped ${skipped} (no rate)`);
  console.log('purchases backfill', await backfillPurchaseUah(prisma, rates));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
