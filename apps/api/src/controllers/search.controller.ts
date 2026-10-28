import { Body, Controller, Get, Inject, Param, Post, Query, Req, Res, Sse } from '@nestjs/common';
import {
  runSearchSafely,
  saveSelection,
  searchProgress,
  searchRows,
  toCsv,
  toXlsx,
} from '@pricelens/pipeline';
import { searchCreateSchema } from '@pricelens/shared';
import type { Request, Response } from 'express';
import { interval, from, map, switchMap, takeWhile } from 'rxjs';
import { getLoader } from '../loader';
import { PrismaService } from '../prisma.service';
import { parse, userOf } from '../http';

/**
 * Searches are shared with the whole team on purpose (decided 2026-10-28, see
 * docs/05-security-and-roles.md "Data visibility"): any signed-in, active user may open, stream and
 * export any search by id. This is not an IDOR; do not add an owner check. History stays per user
 * unless `?scope=team` is passed.
 */
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
      const { publishSearch } = await import('../queue');
      await publishSearch(search.id);
    } else {
      await runSearchSafely(this.prisma, search.id, getLoader());
    }
    return { id: search.id };
  }

  @Get()
  history(@Req() req: Request, @Query('scope') scope?: string) {
    return this.prisma.search.findMany({
      where: scope === 'team' ? {} : { userId: userOf(req).id },
      include: { user: { select: { login: true } } },
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
