import type { CatalogSite } from '@pricelens/shared';
import type { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { syncBuiltinSites } from './sync-sites';

const entry = (over: Partial<CatalogSite>): CatalogSite => ({
  key: 'tex',
  name: 'Tex.ua',
  domain: 'tex.ua',
  urlTemplate: 'https://tex.ua/t/tovary?q={query}',
  regions: ['ua'],
  groups: ['Shops'],
  mode: 'native',
  pollIntervalMinutes: 30,
  maxConcurrency: 1,
  minDelayMs: 800,
  useBrowser: false,
  supportedFilters: [],
  unsupportedFilters: [],
  defaultCondition: 'new',
  legacyTemplates: ['https://tex.ua/search/?query={query}'],
  ...over,
});

function fakePrisma(rows: Array<{ id: string; key: string; urlTemplate: string; domain: string }>) {
  const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
  const prisma = {
    site: {
      findUnique: async ({ where }: { where: { key: string } }) => rows.find((row) => row.key === where.key) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        updates.push({ id: where.id, data });
        return data;
      },
    },
  } as unknown as PrismaClient;
  return { prisma, updates };
}

describe('syncBuiltinSites', () => {
  it('moves a site still on an old built-in URL to the current one', async () => {
    const { prisma, updates } = fakePrisma([
      { id: '1', key: 'tex', urlTemplate: 'https://tex.ua/search/?query={query}', domain: 'tex.ua' },
    ]);
    const changes = await syncBuiltinSites(prisma, [entry({})]);
    expect(changes).toEqual([{ key: 'tex', fields: ['urlTemplate', 'useBrowser', 'supportedFilters', 'unsupportedFilters'] }]);
    expect(updates[0]!.data.urlTemplate).toBe('https://tex.ua/t/tovary?q={query}');
  });

  it('keeps a URL an admin changed by hand', async () => {
    const { prisma, updates } = fakePrisma([
      { id: '1', key: 'tex', urlTemplate: 'https://tex.ua/my/own?q={query}', domain: 'tex.ua' },
    ]);
    expect(await syncBuiltinSites(prisma, [entry({})])).toEqual([]);
    expect(updates).toEqual([]);
  });

  it('moves a renamed shop to its new domain (f.ua is now epicentrk.ua)', async () => {
    const { prisma, updates } = fakePrisma([
      { id: '7', key: 'fua', urlTemplate: 'https://f.ua/search/?query={query}', domain: 'f.ua' },
    ]);
    const fua = entry({
      key: 'fua',
      name: 'Epicentr (ex F.ua)',
      domain: 'epicentrk.ua',
      urlTemplate: 'https://epicentrk.ua/search/?q={query}',
      legacyTemplates: ['https://f.ua/search/?query={query}'],
      legacyDomains: ['f.ua'],
    });
    await syncBuiltinSites(prisma, [fua]);
    expect(updates[0]!.data).toMatchObject({ domain: 'epicentrk.ua', urlTemplate: 'https://epicentrk.ua/search/?q={query}' });
  });

  it('ignores catalogue sites that are not in the database', async () => {
    const { prisma } = fakePrisma([]);
    expect(await syncBuiltinSites(prisma, [entry({})])).toEqual([]);
  });
});
