import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Inject,
  Param,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  assignClickedValue,
  audit,
  latestRateInfo,
  createBackup,
  deleteBackup,
  detectQueryParam,
  expandSearchTemplate,
  templateFromResultsUrl,
  healFromHtml,
  listBackups,
  previewListings,
  readBackup,
  readSettings,
  restoreBackup,
  saveUploadedBackup,
} from '@pricelens/pipeline';
import type { Request, Response } from 'express';
import { AdminGuard } from '../auth';
import { getLoader } from '../loader';
import { assertPublicHttpUrl } from '@pricelens/adapters';
import { PrismaService } from '../prisma.service';
import { userOf } from '../http';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get('settings')
  async settings() {
    const settings = await readSettings(this.prisma);
    const secret = (value: unknown) => (value ? '***' : '');
    return {
      ...settings,
      google_api_key: secret(settings.google_api_key),
      telegram_bot_token: secret(settings.telegram_bot_token),
      smtp_password: secret(settings.smtp_password),
      fx_rates: await latestRateInfo(this.prisma),
    };
  }

  @Put('settings')
  async saveSettings(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const current = await readSettings(this.prisma);
    for (const [key, value] of Object.entries(body)) {
      if (value === '***' || key === 'fx_rates') continue;
      const stored =
        key === 'google_api_key' || key === 'telegram_bot_token' || key === 'smtp_password'
          ? value || current[key]
          : value;
      await this.prisma.setting.upsert({ where: { key }, create: { key, value: stored as object }, update: { value: stored as object } });
    }
    await audit(this.prisma, userOf(req).id, 'settings.update', 'settings');
    return { ok: true };
  }

  @Get('audit')
  auditLog() {
    return this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { actor: true } });
  }

  @Get('health')
  async health() {
    const sites = await this.prisma.site.findMany({ orderBy: { name: 'asc' } });
    const since = new Date(Date.now() - 7 * 86_400_000);
    const checks = await this.prisma.siteHealth.findMany({ where: { checkedAt: { gte: since } } });
    const siteRows = sites.map((site) => {
      const rows = checks.filter((check) => check.siteId === site.id);
      const latest = rows.sort((a, b) => b.checkedAt.getTime() - a.checkedAt.getTime())[0];
      const ok = rows.filter((row) => row.status === 'green').length;
      return {
        siteId: site.id,
        name: site.name,
        status: latest?.status ?? 'unknown',
        lastError: latest?.error ?? null,
        latencyMs: latest?.latencyMs ?? null,
        successRate: rows.length ? ok / rows.length : null,
        checkedAt: latest?.checkedAt ?? null,
      };
    });
    const latestRun = await this.prisma.healthRun.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    return {
      sites: siteRows,
      run: latestRun
        ? {
            id: latestRun.id,
            status: latestRun.status,
            total: latestRun.total,
            done: latestRun.done,
            startedAt: latestRun.startedAt,
            finishedAt: latestRun.finishedAt,
            createdAt: latestRun.createdAt,
          }
        : null,
    };
  }

  @Post('health/run')
  async runHealth() {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60_000);
    const inProgress = await this.prisma.healthRun.findFirst({
      where: {
        status: { in: ['queued', 'running'] },
        createdAt: { gte: thirtyMinAgo },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (inProgress) {
      return {
        id: inProgress.id,
        status: inProgress.status,
        done: inProgress.done,
        total: inProgress.total,
      };
    }
    const enabledCount = await this.prisma.site.count({ where: { enabled: true } });
    const run = await this.prisma.healthRun.create({
      data: {
        status: 'queued',
        total: enabledCount,
        done: 0,
      },
    });
    const { publishHealth } = await import('../queue');
    await publishHealth(run.id);
    return {
      id: run.id,
      status: run.status,
      done: run.done,
      total: run.total,
    };
  }

  @Get('backups')
  backups() {
    return listBackups(process.env.BACKUP_DIR || './backups');
  }

  @Post('backups')
  async backupNow(@Req() req: Request) {
    const settings = await readSettings(this.prisma);
    const name = await createBackup(
      process.env.BACKUP_DIR || './backups',
      process.env.DATABASE_URL || '',
      'manual',
      Number(settings.backup_keep ?? 10),
    );
    await audit(this.prisma, userOf(req).id, 'backup.create', 'backup', name);
    return { name };
  }

  @Get('backups/:name')
  async download(@Param('name') name: string, @Res() res: Response) {
    const body = await readBackup(process.env.BACKUP_DIR || './backups', name);
    res.setHeader('content-disposition', `attachment; filename="${name}"`);
    res.send(body);
  }

  @Delete('backups/:name')
  async removeBackup(@Req() req: Request, @Param('name') name: string) {
    await deleteBackup(process.env.BACKUP_DIR || './backups', name);
    await audit(this.prisma, userOf(req).id, 'backup.delete', 'backup', name);
    return { ok: true };
  }

  @Post('backups/:name/restore')
  async restore(@Req() req: Request, @Param('name') name: string, @Body() body: { confirm?: boolean }) {
    if (!body.confirm) throw new HttpException({ error: 'confirmation_required' }, 400);
    const settings = await readSettings(this.prisma);
    await restoreBackup(process.env.BACKUP_DIR || './backups', process.env.DATABASE_URL || '', name, Number(settings.backup_keep ?? 10));
    await audit(this.prisma, userOf(req).id, 'backup.restore', 'backup', name);
    return { ok: true };
  }

  @Post('backups/upload')
  async upload(@Req() req: Request) {
    const raw = req.body as Buffer;
    const name = String(req.headers['x-backup-name'] || 'upload.dump');
    const settings = await readSettings(this.prisma);
    const stored = await saveUploadedBackup(process.env.BACKUP_DIR || './backups', name, raw, Number(settings.backup_keep ?? 10));
    await audit(this.prisma, userOf(req).id, 'backup.upload', 'backup', stored);
    return { name: stored };
  }

  @Post('constructor/detect')
  detect(@Body() body: { url: string; token: string }) {
    const token = body.token || 'test123';
    const found = templateFromResultsUrl(body.url || '', token);
    return { param: found.param ?? detectQueryParam(body.url || '', token), template: found.template };
  }

  @Post('constructor/preview')
  async preview(@Body() body: { url?: string; html?: string; token?: string }) {
    const token = body.token || 'test123';
    const pageUrl = body.url ? expandSearchTemplate(body.url, token) : '';
    let html = body.html ?? '';
    if (!html && pageUrl) {
      try {
        await assertPublicHttpUrl(pageUrl);
      } catch {
        return { html: '', items: [], url: pageUrl, error: 'blocked_url' };
      }
      try {
        html = await getLoader()({ id: 'preview', key: 'preview', maxConcurrency: 1, minDelayMs: 0, pausedUntil: null }, pageUrl);
      } catch (error) {
        const code = error instanceof Error ? error.message : 'upstream_error';
        return { html: '', items: [], url: pageUrl, error: code };
      }
    }
    const blocked =
      html.length > 0 &&
      /cloudfront|cf-browser-verification|cf-challenge|g-recaptcha|request blocked/i.test(html) &&
      !html.includes('data-cy="l-card"') &&
      !html.includes('__PRERENDERED_STATE__');
    const base = pageUrl || body.url || 'https://preview.local/';
    const items = previewListings(html, base);
    return { html, items, url: pageUrl, error: blocked && items.length === 0 ? 'upstream_blocked' : null };
  }

  @Post('constructor/assign')
  assign(@Body() body: { field: 'title' | 'price' | 'url' | 'image' | 'location' | 'date' | 'description'; sample: string }) {
    return assignClickedValue(body.field, body.sample);
  }

  @Post('constructor/save')
  async save(@Req() req: Request, @Body() body: any) {
    const site = await this.prisma.site.create({
      data: {
        key: body.key || `custom-${Date.now()}`,
        name: body.name,
        domain: body.domain,
        mode: 'native',
        urlTemplate: body.urlTemplate,
        parseRules: body.parseRules ?? {},
        enabled: true,
        regionTags: body.regionTags ?? [],
      },
    });
    await this.prisma.siteConfigVersion.create({
      data: { siteId: site.id, version: 1, config: body, createdBy: userOf(req).id },
    });
    await audit(this.prisma, userOf(req).id, 'site.construct', 'site', site.id);
    return site;
  }

  @Get('constructor/proposals')
  proposals() {
    return this.prisma.healProposal.findMany({ where: { status: 'pending' }, orderBy: { createdAt: 'desc' } });
  }

  @Post('constructor/proposals/:id/approve')
  async approve(@Req() req: Request, @Param('id') id: string) {
    const proposal = await this.prisma.healProposal.update({ where: { id }, data: { status: 'approved' } });
    const site = await this.prisma.site.findUnique({ where: { id: proposal.siteId } });
    const rules = (site?.parseRules ?? {}) as Record<string, unknown>;
    rules[proposal.field] = proposal.diff;
    await this.prisma.site.update({ where: { id: proposal.siteId }, data: { parseRules: rules as object } });
    await audit(this.prisma, userOf(req).id, 'site.heal', 'site', proposal.siteId);
    return proposal;
  }

  @Post('constructor/heal')
  heal(@Body() body: { html: string; css: string }) {
    return healFromHtml(body.html, body.css) ?? { proposal: null };
  }

  @Post('constructor/screenshot')
  async screenshot(@Body() body: { url?: unknown; siteId?: unknown }) {
    if (typeof body?.url !== 'string' || body.url.length > 2000) throw new HttpException({ error: 'validation_error' }, 400);
    try {
      await assertPublicHttpUrl(body.url);
    } catch {
      throw new HttpException({ error: 'blocked_url' }, 400);
    }
    const siteId = typeof body.siteId === 'string' ? body.siteId : undefined;
    return this.prisma.browserShot.create({ data: { url: body.url, siteId, status: 'queued' } });
  }
}
