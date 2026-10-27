import { execSync } from 'node:child_process';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seed } from '../src/seed';

const run = process.env.SKIP_INTEGRATION !== '1';
const url = process.env.DATABASE_URL || 'postgresql://pricelens:pricelens@127.0.0.1:5432/pricelens';

describe.skipIf(!run)('database migration FR data model', () => {
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  beforeAll(() => {
    process.env.DATABASE_URL = url;
    process.env.ADMIN_LOGIN = 'admin';
    process.env.ADMIN_PASSWORD = 'test-password-123';
    execSync('pnpm exec prisma migrate deploy', {
      cwd: path.join(__dirname, '..'),
      env: process.env,
      stdio: 'inherit',
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('migrates and seeds twice', async () => {
    await seed(prisma, process.env);
    await seed(prisma, process.env);
    expect(await prisma.user.count({ where: { login: 'admin' } })).toBe(1);
    expect(await prisma.site.count()).toBe(16);
  });

  it('rejects a duplicate listing URL and cascades a site delete', async () => {
    const site = await prisma.site.findFirstOrThrow();
    const listing = await prisma.listing.create({
      data: { siteId: site.id, url: 'https://example.test/unique-1', title: 'A', price: 10, currency: 'UAH' },
    });
    await expect(
      prisma.listing.create({
        data: { siteId: site.id, url: 'https://example.test/unique-1', title: 'B', price: 11, currency: 'UAH' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await prisma.site.delete({ where: { id: site.id } });
    expect(await prisma.listing.findUnique({ where: { id: listing.id } })).toBeNull();
  });
});
