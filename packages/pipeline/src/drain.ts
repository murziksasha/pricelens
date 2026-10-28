import type { PrismaClient } from '@pricelens/db';
import { runSearch, type LoadPage } from './engine';

/** Claims up to `take` queued searches and runs them. A search that throws is marked 'failed'. */
export async function drainQueuedSearches(prisma: PrismaClient, load: LoadPage, take = 4) {
  const queued = await prisma.search.findMany({ where: { status: 'queued' }, orderBy: { createdAt: 'asc' }, take });
  for (const search of queued) {
    const claim = await prisma.search.updateMany({ where: { id: search.id, status: 'queued' }, data: { status: 'running' } });
    if (claim.count !== 1) continue;
    await runSearchSafely(prisma, search.id, load);
  }
}

export async function runSearchSafely(prisma: PrismaClient, searchId: string, load: LoadPage) {
  try {
    await runSearch(prisma, searchId, { load });
  } catch (error) {
    console.error('search_failed', searchId, error);
    await prisma.search.update({ where: { id: searchId }, data: { status: 'failed' } });
  }
}
