import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { audit } from '@pricelens/pipeline';
import {
  siteWriteSchema,
  sitePatchSchema,
  siteGroupSchema,
  rollbackSchema,
} from '@pricelens/shared';
import type { Request } from 'express';
import { AdminGuard } from '../auth';
import { PrismaService } from '../prisma.service';
import { parse, userOf } from '../http';

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
    const input = parse(sitePatchSchema, body);
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
      // Store the full resulting config (not just the patch) so a rollback restores everything.
      data: { siteId: id, version: site.currentVersion, config: JSON.parse(JSON.stringify(site)), createdBy: userOf(req).id },
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
  async rollback(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(rollbackSchema, body);
    const version = await this.prisma.siteConfigVersion.findUnique({
      where: { siteId_version: { siteId: id, version: input.version } },
    });
    if (!version) throw new HttpException({ error: 'not_found' }, 404);
    // Old versions may hold only the patched fields; restore whatever valid fields they contain.
    const restored = sitePatchSchema.safeParse(version.config);
    if (!restored.success) throw new HttpException({ error: 'validation_error' }, 400);
    const config = restored.data;
    const site = await this.prisma.site.update({
      where: { id },
      data: {
        ...config,
        parseRules: config.parseRules as object | undefined,
        currentVersion: { increment: 1 },
      },
    });
    await this.prisma.siteConfigVersion.create({
      data: { siteId: id, version: site.currentVersion, config: JSON.parse(JSON.stringify(site)), createdBy: userOf(req).id },
    });
    await audit(this.prisma, userOf(req).id, 'site.rollback', 'site', id, { version: input.version });
    return site;
  }

  @Get('site-groups')
  groups() {
    return this.prisma.siteGroup.findMany({ include: { members: true } });
  }

  @Post('site-groups')
  @UseGuards(AdminGuard)
  async createGroup(@Body() body: unknown) {
    const input = parse(siteGroupSchema, body);
    return this.prisma.siteGroup.create({
      data: {
        name: input.name,
        members: { create: [...new Set(input.siteIds)].map((siteId) => ({ siteId })) },
      },
      include: { members: true },
    });
  }
}
