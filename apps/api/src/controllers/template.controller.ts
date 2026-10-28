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
  Put,
  Req,
} from '@nestjs/common';
import { runSearchSafely } from '@pricelens/pipeline';
import { scheduleSchema, templateSchema } from '@pricelens/shared';
import type { Request } from 'express';
import { getLoader } from '../loader';
import { PrismaService } from '../prisma.service';
import { parse, userOf } from '../http';

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
      const { publishSearch } = await import('../queue');
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
