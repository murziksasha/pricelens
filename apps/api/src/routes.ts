import { Body, Controller, Delete, Get, HttpException, Inject, Param, Patch, Post, Put, Query, Req, Res, Sse, UseGuards } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '@pricelens/db';
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
  mergeGroups,
  previewListings,
  readBackup,
  readSettings,
  recordPurchase,
  addPurchaseItem,
  auditPurchase,
  getPurchase,
  listPurchases,
  removePurchaseItem,
  updatePurchase,
  restoreBackup,
  runSearchSafely,
  saveSelection,
  saveUploadedBackup,
  searchProgress,
  searchRows,
  splitListings,
  toCsv,
  toXlsx,
  attachGroup,
} from '@pricelens/pipeline';
import {
  groupMergeSchema,
  groupSplitSchema,
  loginSchema,
  markSchema,
  noteSchema,
  preferencesSchema,
  purchaseItemSchema,
  purchasePatchSchema,
  purchaseSchema,
  scheduleSchema,
  searchCreateSchema,
  siteWriteSchema,
  templateSchema,
  userCreateSchema,
  userPatchSchema,
} from '@pricelens/shared';
import type { Request, Response } from 'express';
import { interval, from, map, switchMap, takeWhile } from 'rxjs';
import {
  AdminGuard,
  AuthUser,
  Public,
  assertLoginAllowed,
  clearLoginFailures,
  loginLimitKeys,
  openSession,
  recordLoginFailure,
} from './auth';
import { getLoader } from './loader';
import { PrismaService } from './prisma.service';
import { sessionExpiry } from './session';

function parse<T>(schema: { safeParse: (body: unknown) => { success: boolean; data?: T } }, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success || result.data === undefined) throw new HttpException({ error: 'validation_error' }, 400);
  return result.data;
}

function userOf(req: Request): AuthUser {
  return (req as Request & { user: AuthUser }).user;
}

@Controller()
export class HealthController {
  @Public()
  @Get('health')
  health() {
    return { ok: true };
  }
}

@Controller('auth')
export class AuthController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Public()
  @Post('login')
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const input = parse(loginSchema, body);
    const keys = loginLimitKeys(req.ip, input.login);
    assertLoginAllowed(keys.pair, keys.ip);
    try {
      const session = await openSession(this.prisma, input.login, input.password);
      clearLoginFailures(keys.pair);
      res.cookie('pl_session', session.token, {
        httpOnly: true,
        sameSite: 'strict',
        path: '/',
        maxAge: sessionExpiry().getTime() - Date.now(),
      });
      return session;
    } catch (error) {
      if (error instanceof HttpException && (error.getResponse() as { error?: string }).error === 'invalid_credentials') {
        recordLoginFailure(keys.pair, keys.ip);
      }
      throw error;
    }
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : req.cookies?.pl_session;
    if (token) {
      const { hashSessionToken } = await import('./session');
      await this.prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
    }
    res.clearCookie('pl_session', { path: '/' });
    return { ok: true };
  }

  @Get('me')
  me(@Req() req: Request) {
    return userOf(req);
  }

  @Patch('me')
  async patchMe(@Req() req: Request, @Body() body: unknown) {
    const input = parse(preferencesSchema, body);
    const data: { language?: string; theme?: string; email?: string | null; emailOptIn?: boolean } = {};
    if (input.language !== undefined) data.language = input.language;
    if (input.theme !== undefined) data.theme = input.theme;
    if (input.email !== undefined) data.email = input.email === '' ? null : input.email;
    if (input.emailOptIn !== undefined) data.emailOptIn = input.emailOptIn;
    const user = await this.prisma.user.update({ where: { id: userOf(req).id }, data });
    return {
      id: user.id,
      login: user.login,
      role: user.role,
      language: user.language,
      theme: user.theme,
      email: user.email,
      emailOptIn: user.emailOptIn,
    };
  }
}

@Controller('users')
@UseGuards(AdminGuard)
export class UsersController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    return users.map((user) => ({
      id: user.id,
      login: user.login,
      role: user.role,
      isActive: user.isActive,
      language: user.language,
      createdAt: user.createdAt,
    }));
  }

  @Post()
  async create(@Req() req: Request, @Body() body: unknown) {
    const input = parse(userCreateSchema, body);
    const user = await this.prisma.user.create({
      data: { login: input.login, role: input.role, passwordHash: await hashPassword(input.password) },
    });
    await audit(this.prisma, userOf(req).id, 'user.create', 'user', user.id, { role: user.role });
    return { id: user.id, login: user.login, role: user.role };
  }

  @Patch(':id')
  async patch(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(userPatchSchema, body);
    const current = await this.prisma.user.findUnique({ where: { id } });
    if (!current) throw new HttpException({ error: 'not_found' }, 404);
    const demotes = (input.role && input.role !== 'admin') || input.isActive === false;
    if (current.role === 'admin' && demotes) {
      const others = await this.prisma.user.count({ where: { role: 'admin', isActive: true, NOT: { id } } });
      if (others === 0) throw new HttpException({ error: 'last_admin' }, 400);
    }
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        role: input.role,
        isActive: input.isActive,
        passwordHash: input.password ? await hashPassword(input.password) : undefined,
      },
    });
    await audit(this.prisma, userOf(req).id, 'user.update', 'user', id, input.password ? { password: true } : input);
    return { id: user.id, login: user.login, role: user.role, isActive: user.isActive };
  }

  @Delete(':id')
  async delete(@Req() req: Request, @Param('id') id: string) {
    const caller = userOf(req);
    if (caller.id === id) throw new HttpException({ error: 'cannot_delete_self' }, 400);

    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new HttpException({ error: 'not_found' }, 404);

    if (target.role === 'admin' && target.isActive) {
      const others = await this.prisma.user.count({ where: { role: 'admin', isActive: true, NOT: { id } } });
      if (others === 0) throw new HttpException({ error: 'last_admin' }, 400);
    }

    await this.prisma.searchTemplate.updateMany({
      where: { ownerId: id, shared: true },
      data: { ownerId: caller.id },
    });

    await this.prisma.listingNote.deleteMany({
      where: { userId: id, shared: false },
    });

    await audit(this.prisma, caller.id, 'user.delete', 'user', id, { login: target.login });
    await this.prisma.user.delete({ where: { id } });
    return { ok: true };
  }
}

@Controller()
export class CatalogController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get('me/sites')
  async mySites(@Req() req: Request) {
    const me = userOf(req);
    const [sites, groups, selected] = await Promise.all([
      this.prisma.site.findMany({ orderBy: [{ priority: 'asc' }, { name: 'asc' }] }),
      this.prisma.siteGroup.findMany({ include: { members: true } }),
      this.prisma.userSiteSelection.findMany({ where: { userId: me.id } }),
    ]);
    const picked = new Map(selected.map((row) => [row.siteId, row.selected]));
    return {
      sites: sites.map((site) => ({
        id: site.id,
        key: site.key,
        name: site.name,
        domain: site.domain,
        enabled: site.enabled,
        mode: site.mode,
        priority: site.priority,
        regionTags: site.regionTags,
        pollIntervalMinutes: site.pollIntervalMinutes,
        selected: picked.get(site.id) ?? true,
      })),
      groups: groups.map((group) => ({
        id: group.id,
        name: group.name,
        preset: group.preset,
        siteIds: group.members.map((member) => member.siteId),
      })),
    };
  }

  @Get('sites')
  async list() {
    return this.prisma.site.findMany({ orderBy: { name: 'asc' } });
  }

  @Post('sites')
  @UseGuards(AdminGuard)
  async create(@Req() req: Request, @Body() body: unknown) {
    const input = parse(siteWriteSchema, body);
    if (!input.key) throw new HttpException({ error: 'validation_error' }, 400);
    const site = await this.prisma.site.create({
      data: {
        key: input.key,
        name: input.name,
        domain: input.domain,
        mode: input.mode,
        urlTemplate: input.urlTemplate,
        enabled: input.enabled ?? true,
        priority: input.priority ?? 100,
        regionTags: input.regionTags ?? [],
        pollIntervalMinutes: input.pollIntervalMinutes ?? 30,
        maxConcurrency: input.maxConcurrency ?? 1,
        minDelayMs: input.minDelayMs ?? 800,
        useBrowser: input.useBrowser ?? false,
        supportedFilters: input.supportedFilters ?? [],
        unsupportedFilters: input.unsupportedFilters ?? [],
        defaultCondition: input.defaultCondition ?? 'unknown',
        parseRules: (input.parseRules ?? {}) as object,
      },
    });
    await this.prisma.siteConfigVersion.create({
      data: { siteId: site.id, version: 1, config: site, createdBy: userOf(req).id },
    });
    await audit(this.prisma, userOf(req).id, 'site.create', 'site', site.id);
    return site;
  }

  @Patch('sites/:id')
  @UseGuards(AdminGuard)
  async patch(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(siteWriteSchema, body);
    const site = await this.prisma.site.update({
      where: { id },
      data: {
        name: input.name,
        domain: input.domain,
        mode: input.mode,
        urlTemplate: input.urlTemplate,
        enabled: input.enabled,
        priority: input.priority,
        regionTags: input.regionTags,
        pollIntervalMinutes: input.pollIntervalMinutes,
        maxConcurrency: input.maxConcurrency,
        minDelayMs: input.minDelayMs,
        useBrowser: input.useBrowser,
        supportedFilters: input.supportedFilters,
        unsupportedFilters: input.unsupportedFilters,
        defaultCondition: input.defaultCondition,
        parseRules: input.parseRules as object | undefined,
        currentVersion: { increment: 1 },
      },
    });
    await this.prisma.siteConfigVersion.create({
      data: { siteId: id, version: site.currentVersion, config: input as object, createdBy: userOf(req).id },
    });
    await audit(this.prisma, userOf(req).id, 'site.update', 'site', id);
    return site;
  }

  @Delete('sites/:id')
  @UseGuards(AdminGuard)
  async remove(@Req() req: Request, @Param('id') id: string) {
    await this.prisma.site.delete({ where: { id } });
    await audit(this.prisma, userOf(req).id, 'site.delete', 'site', id);
    return { ok: true };
  }

  @Get('sites/:id/export')
  @UseGuards(AdminGuard)
  async exportSite(@Param('id') id: string) {
    const site = await this.prisma.site.findUnique({ where: { id }, include: { versions: true } });
    if (!site) throw new HttpException({ error: 'not_found' }, 404);
    return site;
  }

  @Post('sites/import')
  @UseGuards(AdminGuard)
  async importSite(@Req() req: Request, @Body() body: any) {
    const config = body.config ?? body;
    const input = parse(siteWriteSchema, config);
    const key = input.key || `import-${Date.now()}`;
    const site = await this.prisma.site.upsert({
      where: { key },
      update: { name: input.name, domain: input.domain, mode: input.mode, urlTemplate: input.urlTemplate, parseRules: (input.parseRules ?? {}) as object },
      create: {
        key,
        name: input.name,
        domain: input.domain,
        mode: input.mode,
        urlTemplate: input.urlTemplate,
        parseRules: (input.parseRules ?? {}) as object,
        enabled: input.enabled ?? true,
      },
    });
    await audit(this.prisma, userOf(req).id, 'site.import', 'site', site.id);
    return site;
  }

  @Post('sites/:id/rollback')
  @UseGuards(AdminGuard)
  async rollback(@Req() req: Request, @Param('id') id: string, @Body() body: { version: number }) {
    const version = await this.prisma.siteConfigVersion.findUnique({
      where: { siteId_version: { siteId: id, version: Number(body.version) } },
    });
    if (!version) throw new HttpException({ error: 'not_found' }, 404);
    const config = version.config as Record<string, unknown>;
    const site = await this.prisma.site.update({
      where: { id },
      data: {
        name: String(config.name ?? ''),
        domain: String(config.domain ?? ''),
        mode: String(config.mode ?? 'native'),
        urlTemplate: String(config.urlTemplate ?? ''),
        parseRules: (config.parseRules as object) ?? {},
        currentVersion: { increment: 1 },
      },
    });
    await this.prisma.siteConfigVersion.create({
      data: { siteId: id, version: site.currentVersion, config: JSON.parse(JSON.stringify(config)), createdBy: userOf(req).id },
    });
    await audit(this.prisma, userOf(req).id, 'site.rollback', 'site', id, { version: body.version });
    return site;
  }

  @Get('site-groups')
  groups() {
    return this.prisma.siteGroup.findMany({ include: { members: true } });
  }

  @Post('site-groups')
  @UseGuards(AdminGuard)
  async createGroup(@Body() body: { name: string; siteIds?: string[] }) {
    if (!body.name) throw new HttpException({ error: 'validation_error' }, 400);
    return this.prisma.siteGroup.create({
      data: {
        name: body.name,
        members: { create: (body.siteIds ?? []).map((siteId) => ({ siteId })) },
      },
      include: { members: true },
    });
  }
}

@Controller('searches')
export class SearchController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Post()
  async create(@Req() req: Request, @Body() body: unknown) {
    const input = parse(searchCreateSchema, body);
    const me = userOf(req);
    await saveSelection(this.prisma, me.id, input.siteIds);
    const search = await this.prisma.search.create({
      data: {
        userId: me.id,
        query: input.query,
        filters: input.filters as object,
        siteIds: input.siteIds,
        refresh: Boolean(input.refresh),
        status: process.env.INLINE_SEARCH === '0' ? 'queued' : 'running',
      },
    });
    if (process.env.INLINE_SEARCH === '0') {
      const { publishSearch } = await import('./queue');
      await publishSearch(search.id);
    } else {
      await runSearchSafely(this.prisma, search.id, getLoader());
    }
    return { id: search.id };
  }

  @Get()
  history(@Req() req: Request) {
    return this.prisma.search.findMany({
      where: { userId: userOf(req).id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  @Get(':id')
  async one(@Param('id') id: string) {
    const progress = await searchProgress(this.prisma, id);
    const rows = progress.status === 'missing' ? [] : await searchRows(this.prisma, id);
    return { ...progress, rows };
  }

  @Sse(':id/stream')
  stream(@Param('id') id: string) {
    return interval(400).pipe(
      switchMap(() => from(searchProgress(this.prisma, id))),
      takeWhile((progress) => !progress.done && progress.status !== 'missing', true),
      map((progress) => ({ data: progress })),
    );
  }

  @Get(':id/export.csv')
  async csv(@Param('id') id: string, @Res() res: Response) {
    const rows = await this.table(id);
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.send(toCsv(rows));
  }

  @Get(':id/export.xlsx')
  async xlsx(@Param('id') id: string, @Res() res: Response) {
    const rows = await this.table(id);
    res.setHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(toXlsx(rows));
  }

  private async table(id: string) {
    const rows = await searchRows(this.prisma, id);
    const header = ['title', 'price', 'currency', 'price_uah', 'site', 'location', 'condition', 'url', 'deal'];
    return [
      header,
      ...rows.map((row) => [
        row.title,
        String(row.price),
        row.currency,
        row.priceUah == null ? '' : String(row.priceUah),
        row.siteName,
        row.location ?? '',
        row.condition,
        row.url,
        row.deal.label,
      ]),
    ];
  }
}

@Controller()
export class ListingController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Post('listings/:id/visit')
  async visit(@Req() req: Request, @Param('id') id: string) {
    await this.prisma.visit.create({ data: { userId: userOf(req).id, listingId: id } });
    return { ok: true };
  }

  @Post('listings/:id/mark')
  async mark(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(markSchema, body);
    await this.prisma.listingMark.upsert({
      where: { listingId: id },
      create: { listingId: id, status: input.status, tags: input.tags ?? [], updatedBy: userOf(req).id },
      update: { status: input.status, tags: input.tags ?? [], updatedBy: userOf(req).id },
    });
    return { ok: true };
  }

  @Post('listings/:id/notes')
  async note(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(noteSchema, body);
    return this.prisma.listingNote.create({
      data: { listingId: id, userId: userOf(req).id, body: input.body, shared: input.shared },
    });
  }

  @Get('listings/:id/notes')
  notes(@Req() req: Request, @Param('id') id: string) {
    const me = userOf(req);
    return this.prisma.listingNote.findMany({
      where: { listingId: id, OR: [{ shared: true }, { userId: me.id }] },
      orderBy: { createdAt: 'asc' },
    });
  }

  @Patch('listings/:id/specs')
  async specs(@Param('id') id: string, @Body() body: { specs: object }) {
    await this.prisma.listing.update({ where: { id }, data: { specs: body.specs } });
    await attachGroup(this.prisma, id);
    return { ok: true };
  }

  @Post('groups/merge')
  merge(@Req() req: Request, @Body() body: unknown) {
    const input = parse(groupMergeSchema, body);
    return mergeGroups(this.prisma, input.targetId, input.sourceId, userOf(req).id);
  }

  @Post('groups/split')
  split(@Req() req: Request, @Body() body: unknown) {
    const input = parse(groupSplitSchema, body);
    return splitListings(this.prisma, input.listingIds, input.name, userOf(req).id);
  }

  @Get('groups/:id')
  async group(@Param('id') id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        listings: { include: { listing: { include: { site: true, prices: true } } } },
        purchaseItems: { include: { purchase: true } },
      },
    });
    if (!product) throw new HttpException({ error: 'not_found' }, 404);
    return product;
  }

  @Patch('groups/:id')
  async patchGroup(@Param('id') id: string, @Body() body: { expectedSalePrice?: number; minMargin?: number; specs?: object; normalizedName?: string }) {
    return this.prisma.product.update({
      where: { id },
      data: {
        expectedSalePrice: body.expectedSalePrice,
        minMargin: body.minMargin,
        specs: body.specs,
        normalizedName: body.normalizedName,
        manual: true,
      },
    });
  }
}

@Controller('purchases')
export class PurchaseController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Post()
  async create(@Req() req: Request, @Body() body: unknown) {
    const input = parse(purchaseSchema, body);
    const purchase = await recordPurchase(this.prisma, userOf(req).id, input);
    await auditPurchase(this.prisma, userOf(req).id, 'purchase.create', purchase.id);
    return purchase;
  }

  @Get()
  list(@Query('buyer') buyer?: string) {
    return listPurchases(this.prisma, { buyer });
  }

  @Get(':id')
  one(@Param('id') id: string) {
    return getPurchase(this.prisma, id);
  }

  /** salePrice is the TOTAL for the purchase; per-position and per-unit values are re-allocated. */
  @Patch(':id')
  async patch(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(purchasePatchSchema, body);
    await this.assertOwnerOrAdmin(req, id);
    const purchase = await updatePurchase(this.prisma, id, input);
    await auditPurchase(this.prisma, userOf(req).id, 'purchase.update', id);
    return purchase;
  }

  @Post(':id/items')
  async addItem(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(purchaseItemSchema, body);
    await this.assertOwnerOrAdmin(req, id);
    const purchase = await addPurchaseItem(this.prisma, id, input);
    await auditPurchase(this.prisma, userOf(req).id, 'purchase.item_add', id);
    return purchase;
  }

  @Delete(':id/items/:itemId')
  async removeItem(@Req() req: Request, @Param('id') id: string, @Param('itemId') itemId: string) {
    await this.assertOwnerOrAdmin(req, id);
    const purchase = await removePurchaseItem(this.prisma, id, itemId);
    await auditPurchase(this.prisma, userOf(req).id, 'purchase.item_remove', id, { itemId });
    return purchase;
  }

  private async assertOwnerOrAdmin(req: Request, id: string) {
    const me = userOf(req);
    const current = await this.prisma.purchase.findUnique({ where: { id } });
    if (!current) throw new HttpException({ error: 'not_found' }, 404);
    if (current.userId !== me.id && me.role !== 'admin') throw new HttpException({ error: 'forbidden' }, 403);
  }
}

@Controller('templates')
export class TemplateController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  list(@Req() req: Request) {
    const me = userOf(req);
    return this.prisma.searchTemplate.findMany({
      where: { OR: [{ ownerId: me.id }, { shared: true }] },
      include: { schedule: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post()
  create(@Req() req: Request, @Body() body: unknown) {
    const input = parse(templateSchema, body);
    return this.prisma.searchTemplate.create({
      data: {
        ownerId: userOf(req).id,
        name: input.name,
        query: input.query,
        siteIds: input.siteIds,
        filters: input.filters as object,
        sort: input.sort ?? null,
        shared: userOf(req).role === 'admin' ? Boolean(input.shared) : false,
      },
    });
  }

  @Patch(':id')
  async patch(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(templateSchema, body);
    const current = await this.owned(req, id);
    if (input.shared && userOf(req).role !== 'admin') throw new HttpException({ error: 'forbidden' }, 403);
    return this.prisma.searchTemplate.update({
      where: { id: current.id },
      data: {
        name: input.name,
        query: input.query,
        siteIds: input.siteIds,
        filters: input.filters as object,
        sort: input.sort,
        shared: userOf(req).role === 'admin' ? input.shared : undefined,
      },
    });
  }

  @Post(':id/duplicate')
  async duplicate(@Req() req: Request, @Param('id') id: string) {
    const current = await this.prisma.searchTemplate.findUnique({ where: { id } });
    if (!current || (!current.shared && current.ownerId !== userOf(req).id)) {
      throw new HttpException({ error: 'not_found' }, 404);
    }
    return this.prisma.searchTemplate.create({
      data: {
        ownerId: userOf(req).id,
        name: `${current.name} copy`,
        query: current.query,
        siteIds: current.siteIds,
        filters: current.filters as object,
        sort: current.sort,
        shared: false,
      },
    });
  }

  @Post(':id/run')
  async run(@Req() req: Request, @Param('id') id: string) {
    const template = await this.owned(req, id);
    const search = await this.prisma.search.create({
      data: {
        userId: userOf(req).id,
        query: template.query,
        filters: template.filters as object,
        siteIds: template.siteIds,
        refresh: false,
        status: process.env.INLINE_SEARCH === '0' ? 'queued' : 'running',
      },
    });
    if (process.env.INLINE_SEARCH === '0') {
      const { publishSearch } = await import('./queue');
      await publishSearch(search.id);
    } else {
      await runSearchSafely(this.prisma, search.id, getLoader());
    }
    return { id: search.id };
  }

  @Put(':id/schedule')
  async schedule(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    await this.owned(req, id);
    const input = parse(scheduleSchema, body);
    return this.prisma.templateSchedule.upsert({
      where: { templateId: id },
      create: {
        templateId: id,
        enabled: input.enabled,
        intervalMinutes: input.intervalMinutes ?? null,
        dailyTime: input.dailyTime ?? null,
        cron: input.cron ?? '',
        notifyRules: input.notifyRules as object,
      },
      update: {
        enabled: input.enabled,
        intervalMinutes: input.intervalMinutes ?? null,
        dailyTime: input.dailyTime ?? null,
        cron: input.cron ?? '',
        notifyRules: input.notifyRules as object,
      },
    });
  }

  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    await this.owned(req, id);
    await this.prisma.searchTemplate.delete({ where: { id } });
    return { ok: true };
  }

  private async owned(req: Request, id: string) {
    const template = await this.prisma.searchTemplate.findUnique({ where: { id } });
    if (!template) throw new HttpException({ error: 'not_found' }, 404);
    if (template.ownerId !== userOf(req).id && userOf(req).role !== 'admin') {
      throw new HttpException({ error: 'forbidden' }, 403);
    }
    return template;
  }
}

@Controller('notifications')
export class NotificationController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  list(@Req() req: Request) {
    return this.prisma.notification.findMany({
      where: { userId: userOf(req).id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Get('unread')
  async unread(@Req() req: Request) {
    const count = await this.prisma.notification.count({ where: { userId: userOf(req).id, readAt: null } });
    return { count };
  }

  @Post('read')
  async read(@Req() req: Request) {
    await this.prisma.notification.updateMany({
      where: { userId: userOf(req).id, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}

@Controller('telegram')
export class TelegramController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Post('code')
  async code(@Req() req: Request) {
    const value = randomBytes(4).toString('hex');
    await this.prisma.telegramCode.upsert({
      where: { userId: userOf(req).id },
      create: { userId: userOf(req).id, code: value, expiresAt: new Date(Date.now() + 15 * 60_000) },
      update: { code: value, expiresAt: new Date(Date.now() + 15 * 60_000) },
    });
    return { code: value };
  }
}

@Controller('settings')
export class SettingsController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Public()
  @Get('public')
  async publicSettings() {
    const settings = await readSettings(this.prisma);
    return {
      deal_green_threshold: settings.deal_green_threshold,
      deal_yellow_threshold: settings.deal_yellow_threshold,
      min_margin_uah: settings.min_margin_uah,
      cost_delivery: settings.cost_delivery,
      cost_repair: settings.cost_repair,
      default_language: settings.default_language,
      default_currency: settings.default_currency,
    };
  }
}

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
    const { publishHealth } = await import('./queue');
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
  async screenshot(@Body() body: { url: string; siteId?: string }) {
    return this.prisma.browserShot.create({ data: { url: body.url, siteId: body.siteId, status: 'queued' } });
  }
}
