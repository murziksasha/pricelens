import type { PrismaClient } from '@pricelens/db';
import { detectDefects, median, toUah } from '@pricelens/shared';
import { loadRates } from './fx';
import { readSettings } from './engine';

type Db = PrismaClient;
const DAY = 86_400_000;

/** Every observed price of one listing, oldest first. */
export async function listingPriceHistory(prisma: Db, listingId: string) {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { prices: { orderBy: { seenAt: 'asc' } } },
  });
  if (!listing) return null;
  const rates = await loadRates(prisma, await readSettings(prisma));
  return {
    currency: listing.currency,
    points: listing.prices.map((row) => ({
      at: row.seenAt.toISOString(),
      price: Number(row.price),
      priceUah: toUah(Number(row.price), listing.currency, rates),
    })),
  };
}

/**
 * Daily median asking price (UAH) of the working used units in a group. A listing counts on a day
 * when it had been seen by then and was still seen on or after that day; its price is the latest one
 * observed up to the end of the day. Re-posts and defective units are left out, as in deal scoring.
 */
export async function groupPriceHistory(prisma: Db, productId: string, days = 90, now = new Date()) {
  const members = await prisma.productListing.findMany({
    where: { productId },
    include: { listing: { include: { dupOf: true, prices: { orderBy: { seenAt: 'asc' } } } } },
  });
  const rates = await loadRates(prisma, await readSettings(prisma));
  const listings = members
    .map((member) => member.listing)
    .filter(
      (listing) =>
        listing.condition === 'used' && !listing.dupOf && detectDefects(listing.title, listing.description).length === 0,
    );
  const start = Math.floor((now.getTime() - (days - 1) * DAY) / DAY) * DAY;
  const points: Array<{ day: string; median: number; samples: number }> = [];
  for (let dayStart = start; dayStart <= now.getTime(); dayStart += DAY) {
    const dayEnd = dayStart + DAY - 1;
    const values: number[] = [];
    for (const listing of listings) {
      if (listing.firstSeenAt.getTime() > dayEnd || listing.lastSeenAt.getTime() < dayStart) continue;
      const latest = [...listing.prices].reverse().find((row) => row.seenAt.getTime() <= dayEnd);
      if (!latest) continue;
      const value = toUah(Number(latest.price), listing.currency, rates);
      if (value != null) values.push(value);
    }
    if (!values.length) continue;
    const mid = median(values);
    points.push({ day: new Date(dayStart).toISOString().slice(0, 10), median: Math.round(mid), samples: values.length });
  }
  return points;
}
