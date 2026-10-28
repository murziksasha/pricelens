import { PrismaClient } from '@prisma/client';
import { RequestLayer } from '@pricelens/adapters';
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
  runSearch,
  telegramListingMessage,
  dispatchEmailNotifications,
  refreshNbuRates,
} from '@pricelens/pipeline';
import { capturePage, readRenderedHtml } from './browser';

const prisma = new PrismaClient();
const layer = new RequestLayer({
  onPause: async (siteId) => {
    await prisma.site.update({
      where: { id: siteId },
      data: { pausedUntil: new Date(Date.now() + 15 * 60_000) },
    });
    await notifyAdmins(prisma, 'site_paused', { siteId });
  },
});

async function load(
  site: { id: string; maxConcurrency: number; minDelayMs: number; pausedUntil: Date | null; useBrowser?: boolean },
  url: string,
) {
  if (site.useBrowser) {
    try {
      const rendered = await readRenderedHtml(url);
      if (rendered) return rendered;
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

async function maybeBackup() {
  if (process.env.BACKUP_AUTORUN === '0') return;
  const settings = await readSettings(prisma);
  const dir = process.env.BACKUP_DIR || './backups';
  const files = await listBackups(dir);
  const newest = files.find((file) => file.kind === 'auto');
  const cron = String(settings.backup_cron || '0 3 * * *');
  const missed = !newest || Date.now() - newest.mtimeMs > 24 * 3600_000;
  if (missed || cronMatches(cron, new Date())) {
    try {
      await createBackup(dir, process.env.DATABASE_URL || '', 'auto', Number(settings.backup_keep ?? 10));
    } catch (error) {
      await notifyAdmins(prisma, 'backup_failed', { error: error instanceof Error ? error.message : 'backup_failed' });
    }
  }
}

async function drain() {
  const queued = await prisma.search.findMany({ where: { status: 'queued' }, take: 4 });
  for (const search of queued) {
    const claim = await prisma.search.updateMany({
      where: { id: search.id, status: 'queued' },
      data: { status: 'running' },
    });
    if (claim.count !== 1) continue;
    try {
      await runSearch(prisma, search.id, { load });
    } catch (error) {
      console.error(error);
      await prisma.search.update({ where: { id: search.id }, data: { status: 'complete' } });
    }
  }
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

