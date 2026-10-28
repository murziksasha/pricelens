import { execSync } from 'node:child_process';
import path from 'node:path';
import { PrismaClient } from '@pricelens/db';

export const runIntegration = process.env.SKIP_INTEGRATION !== '1';
export const dbUrl = process.env.DATABASE_URL || 'postgresql://pricelens:pricelens@127.0.0.1:5432/pricelens';

export function migrate() {
  process.env.DATABASE_URL = dbUrl;
  execSync('pnpm exec prisma migrate deploy', {
    cwd: path.join(__dirname, '../../db'),
    env: process.env,
    stdio: 'ignore',
  });
}

/** Empties every application table (keeps _prisma_migrations). */
export async function resetDb(prisma: PrismaClient) {
  const tables = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );
  if (tables.length === 0) return;
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
}

let seq = 0;

export async function makeSite(prisma: PrismaClient) {
  seq += 1;
  return prisma.site.create({
    data: { key: `test-${seq}`, name: `Test ${seq}`, domain: `test${seq}.example`, mode: 'native', urlTemplate: 'https://x/?q={query}' },
  });
}

export async function makeListing(
  prisma: PrismaClient,
  siteId: string,
  data: { title: string; price: number; currency?: string; priceUah?: number | null; condition?: string },
) {
  seq += 1;
  return prisma.listing.create({
    data: {
      siteId,
      url: `https://example.test/listing-${seq}`,
      title: data.title,
      price: data.price,
      currency: data.currency ?? 'UAH',
      priceUah: data.priceUah === undefined ? (data.currency && data.currency !== 'UAH' ? null : data.price) : data.priceUah,
      condition: data.condition ?? 'used',
    },
  });
}

export async function makeUser(prisma: PrismaClient, login = 'tester') {
  return prisma.user.create({ data: { login, passwordHash: 'x', role: 'admin' } });
}
