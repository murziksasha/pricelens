import { drainQueuedSearches } from '@pricelens/pipeline';
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
      await queue.createQueue('health').catch(() => undefined);
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

export async function publishHealth(runId: string) {
  try {
    const queue = await boss();
    await queue.send('health', { runId });
  } catch (error) {
    console.error('queue_send_failed', error);
  }
}

/** Drains queued searches in-process (used when no worker is running). */
export async function drainSearches(prisma: PrismaService | import('@prisma/client').PrismaClient) {
  await drainQueuedSearches(prisma as import('@prisma/client').PrismaClient, getLoader());
}
