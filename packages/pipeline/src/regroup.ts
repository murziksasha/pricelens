import type { PrismaClient } from '@pricelens/db';
import { extractLaptopSpecs, groupKeyFromSpecs, specConfidence, specsCompatible, type LaptopSpecs } from '@pricelens/shared';
import { attachGroup } from './engine';

export interface RegroupReport {
  scanned: number;
  manualKept: number;
  wouldMove: number;
  wouldGroup: number;
  wouldUngroup: number;
  moved: number;
  removedEmptyGroups: number;
  examples: Array<{ title: string; from: string | null; to: string | null }>;
}

/**
 * 1.5: re-applies spec extraction + grouping to every automatically grouped listing.
 * Manual decisions (productListing.manual) are never touched. Products that end up empty are deleted
 * only when they are not manual and have no purchases. Run with dryRun first.
 */
export async function regroupListings(prisma: PrismaClient, opts: { dryRun: boolean; batch?: number }): Promise<RegroupReport> {
  const report: RegroupReport = {
    scanned: 0,
    manualKept: 0,
    wouldMove: 0,
    wouldGroup: 0,
    wouldUngroup: 0,
    moved: 0,
    removedEmptyGroups: 0,
    examples: [],
  };
  let cursor: string | undefined;
  for (;;) {
    const listings = await prisma.listing.findMany({
      orderBy: { id: 'asc' },
      take: opts.batch ?? 500,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: { grouped: { include: { product: true } } },
    });
    if (listings.length === 0) break;
    cursor = listings[listings.length - 1]!.id;
    for (const listing of listings) {
      report.scanned += 1;
      if (listing.grouped?.manual) {
        report.manualKept += 1;
        continue;
      }
      const extra = (listing.specs ?? {}) as Partial<LaptopSpecs>;
      const specs = { ...extractLaptopSpecs(listing.title, listing.description ?? '') };
      for (const key of Object.keys(extra) as (keyof LaptopSpecs)[]) {
        if (extra[key] != null && extra[key] !== '') (specs as Record<string, unknown>)[key] = extra[key];
      }
      const key = groupKeyFromSpecs(specs);
      const groupable = Boolean(key) && specConfidence(specs) >= 0.5;
      const current = listing.grouped?.product ?? null;
      const stays =
        current && groupable && (current.groupKey === key || specsCompatible(specs, current.specs as unknown as LaptopSpecs));
      if (stays) continue;
      if (!current && !groupable) continue;
      if (!current) report.wouldGroup += 1;
      else if (!groupable) report.wouldUngroup += 1;
      else report.wouldMove += 1;
      if (report.examples.length < 20) {
        report.examples.push({ title: listing.title, from: current?.normalizedName ?? null, to: groupable ? key : null });
      }
      if (opts.dryRun) continue;
      if (current && !groupable) await prisma.productListing.delete({ where: { listingId: listing.id } });
      else await attachGroup(prisma, listing.id);
      report.moved += 1;
    }
  }
  if (!opts.dryRun) {
    const empty = await prisma.product.findMany({
      where: { manual: false, listings: { none: {} }, purchases: { none: {} }, purchaseItems: { none: {} } },
      select: { id: true },
    });
    if (empty.length) {
      const removed = await prisma.product.deleteMany({ where: { id: { in: empty.map((row) => row.id) } } });
      report.removedEmptyGroups = removed.count;
    }
  }
  return report;
}
