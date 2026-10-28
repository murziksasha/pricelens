import { SITE_CATALOG, type CatalogSite } from '@pricelens/shared';
import type { PrismaClient } from '@prisma/client';

export interface SiteSyncChange {
  key: string;
  fields: string[];
}

/**
 * Moves built-in sites that still hold an earlier built-in search URL or domain to the current
 * catalogue values. Sites an admin changed by hand (any other URL) are left alone. Safe to run on
 * every start; the seed only runs on an empty database, so this is how URL fixes reach old installs.
 */
export async function syncBuiltinSites(
  prisma: PrismaClient,
  catalog: CatalogSite[] = SITE_CATALOG,
): Promise<SiteSyncChange[]> {
  const changes: SiteSyncChange[] = [];
  for (const entry of catalog) {
    const row = await prisma.site.findUnique({ where: { key: entry.key } });
    if (!row) continue;
    const data: Record<string, unknown> = {};
    if (row.urlTemplate !== entry.urlTemplate && (entry.legacyTemplates ?? []).includes(row.urlTemplate)) {
      data.urlTemplate = entry.urlTemplate;
      data.useBrowser = entry.useBrowser;
      data.supportedFilters = entry.supportedFilters;
      data.unsupportedFilters = entry.unsupportedFilters;
    }
    if (row.domain !== entry.domain && (entry.legacyDomains ?? []).includes(row.domain)) {
      data.domain = entry.domain;
      data.name = entry.name;
    }
    if (Object.keys(data).length === 0) continue;
    await prisma.site.update({ where: { id: row.id }, data });
    changes.push({ key: entry.key, fields: Object.keys(data) });
  }
  return changes;
}
