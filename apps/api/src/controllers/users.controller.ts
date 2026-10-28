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
import { hashPassword } from '@pricelens/db';
import { audit } from '@pricelens/pipeline';
import { userCreateSchema, userPatchSchema } from '@pricelens/shared';
import type { Request } from 'express';
import { AdminGuard } from '../auth';
import { PrismaService } from '../prisma.service';
import { parse, userOf } from '../http';

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
