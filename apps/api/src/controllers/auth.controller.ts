import {
  Body,
  Controller,
  Get,
  HttpException,
  Inject,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { loginSchema, preferencesSchema } from '@pricelens/shared';
import type { Request, Response } from 'express';
import {
  Public,
  assertLoginAllowed,
  clearLoginFailures,
  loginLimitKeys,
  openSession,
  recordLoginFailure,
} from '../auth';
import { PrismaService } from '../prisma.service';
import { sessionExpiry } from '../session';
import { parse, userOf } from '../http';

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
      const { hashSessionToken } = await import('../session');
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
