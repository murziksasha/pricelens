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
  Query,
  Req,
} from '@nestjs/common';
import {
  recordPurchase,
  addPurchaseItem,
  auditPurchase,
  getPurchase,
  listPurchases,
  removePurchaseItem,
  updatePurchase,
} from '@pricelens/pipeline';
import { purchaseItemSchema, purchasePatchSchema, purchaseSchema } from '@pricelens/shared';
import type { Request } from 'express';
import { PrismaService } from '../prisma.service';
import { parse, userOf } from '../http';

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
