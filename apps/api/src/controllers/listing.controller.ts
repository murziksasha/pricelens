import {
  Body,
  Controller,
  Get,
  HttpException,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { audit, mergeGroups, splitListings, attachGroup, groupPriceHistory, listingPriceHistory } from '@pricelens/pipeline';
import {
  groupMergeSchema,
  groupSplitSchema,
  markSchema,
  noteSchema,
  groupPatchSchema,
  listingSpecsSchema,
} from '@pricelens/shared';
import type { Request } from 'express';
import { PrismaService } from '../prisma.service';
import { parse, userOf } from '../http';

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
  async specs(@Param('id') id: string, @Body() body: unknown) {
    const input = parse(listingSpecsSchema, body);
    const listing = await this.prisma.listing.findUnique({ where: { id }, select: { specs: true } });
    if (!listing) throw new HttpException({ error: 'not_found' }, 404);
    const specs = { ...((listing.specs as object | null) ?? {}), ...input.specs };
    await this.prisma.listing.update({ where: { id }, data: { specs } });
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

  @Get('listings/:id/prices')
  async listingPrices(@Param('id') id: string) {
    const history = await listingPriceHistory(this.prisma, id);
    if (!history) throw new HttpException({ error: 'not_found' }, 404);
    return history;
  }

  @Get('groups/:id/price-history')
  async groupHistory(@Param('id') id: string, @Query('days') days?: string) {
    const span = Math.min(365, Math.max(7, Number(days) || 90));
    return groupPriceHistory(this.prisma, id, span);
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
  async patchGroup(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(groupPatchSchema, body);
    const product = await this.prisma.product.findUnique({ where: { id }, select: { specs: true } });
    if (!product) throw new HttpException({ error: 'not_found' }, 404);
    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        expectedSalePrice: input.expectedSalePrice,
        minMargin: input.minMargin,
        specs: input.specs ? { ...((product.specs as object | null) ?? {}), ...input.specs } : undefined,
        normalizedName: input.normalizedName,
        manual: true,
      },
    });
    await audit(this.prisma, userOf(req).id, 'group.patch', 'product', id, input);
    return updated;
  }
}
