import { Controller, Inject, Post, Req } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Request } from 'express';
import { PrismaService } from '../prisma.service';
import { userOf } from '../http';

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
