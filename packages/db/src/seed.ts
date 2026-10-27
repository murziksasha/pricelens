import { DEFAULT_SETTINGS, SITE_CATALOG } from '@pricelens/shared';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from './password';

export async function seed(prisma: PrismaClient, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const login = env.ADMIN_LOGIN || 'admin';
  const password = env.ADMIN_PASSWORD || 'changeme';
  if (env.NODE_ENV === 'production' && password === 'changeme') {
    throw new Error('refusing default admin password in production');
  }
  const passwordHash = await hashPassword(password);
  await prisma.user.upsert({
    where: { login },
    update: { passwordHash, role: 'admin', isActive: true },
    create: { login, passwordHash, role: 'admin', language: 'en', theme: 'system' },
  });

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.upsert({
      where: { key },
      update: {},
      create: { key, value },
    });
  }

  for (const site of SITE_CATALOG) {
    await prisma.site.upsert({
      where: { key: site.key },
      update: {
        name: site.name,
        domain: site.domain,
        mode: site.mode,
        urlTemplate: site.urlTemplate,
        regionTags: site.regions,
        pollIntervalMinutes: site.pollIntervalMinutes,
        maxConcurrency: site.maxConcurrency,
        minDelayMs: site.minDelayMs,
        useBrowser: site.useBrowser,
        supportedFilters: site.supportedFilters,
        unsupportedFilters: site.unsupportedFilters,
        defaultCondition: site.defaultCondition,
      },
      create: {
        key: site.key,
        name: site.name,
        domain: site.domain,
        mode: site.mode,
        urlTemplate: site.urlTemplate,
        regionTags: site.regions,
        pollIntervalMinutes: site.pollIntervalMinutes,
        maxConcurrency: site.maxConcurrency,
        minDelayMs: site.minDelayMs,
        useBrowser: site.useBrowser,
        supportedFilters: site.supportedFilters,
        unsupportedFilters: site.unsupportedFilters,
        defaultCondition: site.defaultCondition,
        enabled: true,
        priority: 100,
        parseRules: {},
      },
    });
  }

  for (const name of ['Classifieds', 'Shops']) {
    const existing = await prisma.siteGroup.findFirst({ where: { name } });
    const group = existing ?? (await prisma.siteGroup.create({ data: { name, preset: true } }));
    const keys = SITE_CATALOG.filter((site) => site.groups.includes(name)).map((site) => site.key);
    const sites = await prisma.site.findMany({ where: { key: { in: keys } } });
    for (const site of sites) {
      await prisma.siteGroupMember.upsert({
        where: { groupId_siteId: { groupId: group.id, siteId: site.id } },
        update: {},
        create: { groupId: group.id, siteId: site.id },
      });
    }
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await seed(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
