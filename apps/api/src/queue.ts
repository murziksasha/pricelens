import { runSearch } from '@pricelens/pipeline';
import { getLoader } from './loader';
import { PrismaService } from './prisma.service';

let bossPromise: Promise<{ send: (name: string, data: object) => Promise<unknown> }> | null = null;

async function boss() {
  if (!bossPromise) {
    bossPromise = (async () => {
      const loaded = (await import('pg-boss')) as unknown as { default: new (url: string) => any };
      const PgBoss = loaded.default;
      const queue = new PgBoss(process.env.DATABASE_URL || '');
      await queue.start();
      await queue.createQueue('search').catch(() => undefined);
      return queue;
    })();
  }
  return bossPromise;
}

/** Wake the worker. The worker claims queued searches, so a missed send still drains. */
export async function publishSearch(searchId: string) {
  try {
    const queue = await boss();
    await queue.send('search', { searchId });
  } catch (error) {
    console.error('queue_send_failed', error);
  }
}

export async function drainSearches(prisma: PrismaService | import('@prisma/client').PrismaClient) {
  const queued = await prisma.search.findMany({ where: { status: 'queued' }, take: 4 });
  for (const search of queued) {
    const claim = await prisma.search.updateMany({
      where: { id: search.id, status: 'queued' },
      data: { status: 'running' },
    });
    if (claim.count !== 1) continue;
    try {
      await runSearch(prisma as import('@prisma/client').PrismaClient, search.id, { load: getLoader() });
    } catch (error) {
      console.error(error);
      await prisma.search.update({ where: { id: search.id }, data: { status: 'complete' } });
    }
  }
}
