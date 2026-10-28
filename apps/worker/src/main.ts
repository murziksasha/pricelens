import { PrismaClient } from '@prisma/client';
import { RequestLayer, assertPublicHttpUrl, extractListings, looksBlockedPage } from '@pricelens/adapters';
import { cronMatches } from '@pricelens/shared';
import {
  checkSite,
  createBackup,
  listBackups,
  notifyAdmins,
  parseStartCode,
  parseTelegramCallback,
  readSettings,
  runDueSchedules,
  telegramListingMessage,
  dispatchEmailNotifications,
  drainQueuedSearches,
  refreshNbuRates,
} from '@pricelens/pipeline';
import { capturePage, readRenderedHtml } from './browser';

const prisma = new PrismaClient();
const guardUrl = async (url: string) => {
  await assertPublicHttpUrl(url);
};

const layer = new RequestLayer({
  urlGuard: guardUrl,
  onPause: async (siteId) => {
    await prisma.site.update({
      where: { id: siteId },
      data: { pausedUntil: new Date(Date.now() + 15 * 60_000) },
    });
    await notifyAdmins(prisma, 'site_paused', { siteId });
  },
});

async function load(
  site: { id: string; domain?: string; maxConcurrency: number; minDelayMs: number; pausedUntil: Date | null; useBrowser?: boolean },
  url: string,
) {
  if (site.useBrowser) {
    await guardUrl(url);
    try {
      const rendered = await readRenderedHtml(url);
      // Use the rendered page only when it really has listings; a block, consent or challenge page
      // falls through to the HTTP/2 fetch below instead of showing "no listings".
      const usable =
        rendered && !looksBlockedPage(rendered) && extractListings(rendered, { baseUrl: `https://${site.domain ?? ''}/` }).length > 0;
      if (usable) return rendered;
      console.error('browser_load_unusable', url);
    } catch (error) {
      console.error('browser_load_failed', error instanceof Error ? error.message : error);
    }
  }
  const result = await layer.getText(
    {
      id: site.id,
      maxConcurrency: site.maxConcurrency,
      minDelayMs: site.minDelayMs,
      pausedUntil: site.pausedUntil ? site.pausedUntil.getTime() : null,
    },
    url,
  );
  return result.text;
}

let lastFxRefresh = 0;

/** FR-ADM-002: refresh NBU USD/EUR rates every 6 hours (idempotent upsert). */
async function maybeRefreshFx() {
  if (process.env.FX_AUTORUN === '0') return;
  if (Date.now() - lastFxRefresh < 6 * 3600_000) return;
  lastFxRefresh = Date.now();
  await refreshNbuRates(prisma);
}

let telegramOffset = 0;

async function pollTelegram() {
  const settings = await readSettings(prisma);
  const token = String(settings.telegram_bot_token || '');
  if (!token) return;
  const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates?timeout=0&offset=${telegramOffset}`);
  if (!response.ok) return;
  const body = (await response.json()) as { result?: Array<Record<string, any>> };
  for (const update of body.result ?? []) {
    telegramOffset = Number(update.update_id) + 1;
    const text = update.message?.text as string | undefined;
    const code = text ? parseStartCode(text) : null;
    if (code && update.message?.chat?.id) {
      const link = await prisma.telegramCode.findUnique({ where: { code } });
      if (link && link.expiresAt > new Date()) {
        await prisma.telegramLink.upsert({
          where: { userId: link.userId },
          create: { userId: link.userId, chatId: String(update.message.chat.id) },
          update: { chatId: String(update.message.chat.id) },
        });
        await prisma.telegramCode.delete({ where: { userId: link.userId } });
      }
    }
    const data = update.callback_query?.data as string | undefined;
    const parsed = data ? parseTelegramCallback(data) : null;
    if (parsed) {
      await prisma.listingMark.upsert({
        where: { listingId: parsed.listingId },
        create: { listingId: parsed.listingId, status: parsed.status },
        update: { status: parsed.status },
      });
    }
  }
  const fresh = await prisma.notification.findMany({ where: { readAt: null, type: 'template_hit' }, take: 20 });
  for (const note of fresh) {
    const payload = note.payload as Record<string, string>;
    if (!payload.listingId) continue;
    const link = await prisma.telegramLink.findUnique({ where: { userId: note.userId } });
    if (!link) continue;
    const message = telegramListingMessage({
      title: payload.title,
      price: Number(payload.price),
      currency: payload.currency,
      site: payload.site,
      city: payload.city,
      deal: payload.deal,
      url: payload.url,
      listingId: payload.listingId,
    });
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: link.chatId, text: message.text, reply_markup: message.reply_markup }),
    });
  }
}

async function shots() {
  const queued = await prisma.browserShot.findMany({ where: { status: 'queued' }, take: 1 });
  for (const shot of queued) {
    await prisma.browserShot.update({ where: { id: shot.id }, data: { status: 'running' } });
    try {
      await guardUrl(shot.url);
      const captured = await capturePage(shot.url);
      await prisma.browserShot.update({
        where: { id: shot.id },
        data: { status: 'ready', imageBase64: captured.imageBase64, boxes: captured.boxes as object },
      });
    } catch (error) {
      await prisma.browserShot.update({
        where: { id: shot.id },
        data: { status: 'error', error: error instanceof Error ? error.message : 'screenshot_failed' },
      });
    }
  }
}

let backupRunning = false;

/**
 * FR-ADM-004 scheduled backup. Called on every tick: runs when the cron matches or the last auto
 * backup is older than 24h (laptop was off), but never twice within an hour.
 */
async function maybeBackup() {
  if (process.env.BACKUP_AUTORUN === '0' || backupRunning) return;
  const settings = await readSettings(prisma);
  const dir = process.env.BACKUP_DIR || './backups';
  const files = await listBackups(dir);
  const newest = files.find((file) => file.kind === 'auto');
  const cron = String(settings.backup_cron || '0 3 * * *');
  const age = newest ? Date.now() - newest.mtimeMs : Infinity;
  if (age < 60 * 60_000) return;
  if (age <= 24 * 3600_000 && !cronMatches(cron, new Date())) return;
  backupRunning = true;
  try {
    await createBackup(dir, process.env.DATABASE_URL || '', 'auto', Number(settings.backup_keep ?? 10));
  } catch (error) {
    await notifyAdmins(prisma, 'backup_failed', { error: error instanceof Error ? error.message : 'backup_failed' });
  } finally {
    backupRunning = false;
  }
}

async function drain() {
  await drainQueuedSearches(prisma, load);
}

async function drainHealth() {
  const queued = await prisma.healthRun.findFirst({
    where: { status: 'queued' },
    orderBy: { createdAt: 'asc' },
  });
  if (!queued) return;
  const claim = await prisma.healthRun.updateMany({
    where: { id: queued.id, status: 'queued' },
    data: { status: 'running', startedAt: new Date() },
  });
  if (claim.count !== 1) return;

  try {
    const sites = await prisma.site.findMany({ where: { enabled: true }, orderBy: { name: 'asc' } });
    for (const site of sites) {
      try {
        await checkSite(prisma, site.id, load);
      } catch (siteErr) {
        console.error(`checkSite failed for site ${site.id}:`, siteErr);
      }
      await prisma.healthRun.update({
        where: { id: queued.id },
        data: { done: { increment: 1 } },
      });
    }
    await prisma.healthRun.update({
      where: { id: queued.id },
      data: { status: 'complete', finishedAt: new Date() },
    });
  } catch (error) {
    console.error('health_run_error', error);
    await prisma.healthRun.update({
      where: { id: queued.id },
      data: { status: 'error', finishedAt: new Date() },
    });
  }
}

async function maybeScheduleHealthRun() {
  const inProgress = await prisma.healthRun.findFirst({
    where: { status: { in: ['queued', 'running'] } },
  });
  if (inProgress) return;

  const latestComplete = await prisma.healthRun.findFirst({
    where: { status: 'complete' },
    orderBy: { finishedAt: 'desc' },
  });
  const sixtyMinAgo = new Date(Date.now() - 60 * 60_000);
  if (!latestComplete || (latestComplete.finishedAt ?? latestComplete.createdAt) < sixtyMinAgo) {
    const total = await prisma.site.count({ where: { enabled: true } });
    await prisma.healthRun.create({
      data: {
        status: 'queued',
        total,
        done: 0,
      },
    });
  }
}

async function main() {
  const loaded = (await import('pg-boss')) as unknown as { default: new (url: string) => any };
  const PgBoss = loaded.default;
  const queue = new PgBoss(process.env.DATABASE_URL || '');
  await queue.start();
  await queue.createQueue('search').catch(() => undefined);
  await queue.createQueue('health').catch(() => undefined);
  await queue.work('search', async () => {
    await drain();
  });
  await queue.work('health', async () => {
    await drainHealth();
  });
  const tick = async () => {
    await drain();
    await maybeScheduleHealthRun().catch((error) => console.error(error));
    await drainHealth().catch((error) => console.error(error));
    await runDueSchedules(prisma, { load: load }).catch((error) => console.error(error));
    await pollTelegram().catch((error) => console.error(error));
    await dispatchEmailNotifications(prisma).catch((error) => console.error(error));
    await shots().catch((error) => console.error(error));
    await maybeRefreshFx().catch((error) => console.error('fx_refresh_failed', error));
    await maybeBackup().catch((error) => console.error(error));
  };
  await maybeBackup().catch((error) => console.error(error));
  setInterval(() => {
    tick().catch((error) => console.error(error));
  }, 15_000);
  await tick();
  console.log('worker started');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

