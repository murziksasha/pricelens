import { Controller, Get, Inject, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma.service';
import { userOf } from '../http';

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
