import { CanActivate, ExecutionContext, HttpException, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { verifyPassword } from '@pricelens/db';
import type { Request } from 'express';
import { PrismaService } from './prisma.service';
import { hashSessionToken, newSessionToken, sessionExpired, sessionExpiry } from './session';

export const IS_PUBLIC = 'pricelens_public';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export interface AuthUser {
  id: string;
  login: string;
  role: 'admin' | 'user';
  isActive: boolean;
  language: string;
  theme: string;
  email: string | null;
  emailOptIn: boolean;
}

const fails = new Map<string, { count: number; reset: number }>();

export function resetLoginLimits() {
  fails.clear();
}

function readToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.pl_session;
  return cookie || null;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = readToken(req);
    if (!token) {
      if (isPublic) return true;
      throw new HttpException({ error: 'unauthorized' }, 401);
    }
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: { user: true },
    });
    if (!session || sessionExpired(session.expiresAt)) {
      if (session) await this.prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
      if (isPublic) return true;
      throw new HttpException({ error: 'unauthorized' }, 401);
    }
    if (!session.user.isActive) throw new HttpException({ error: 'inactive_user' }, 403);
    req.user = {
      id: session.user.id,
      login: session.user.login,
      role: session.user.role,
      isActive: session.user.isActive,
      language: session.user.language,
      theme: session.user.theme,
      email: session.user.email,
      emailOptIn: session.user.emailOptIn,
    };
    return true;
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (req.user?.role !== 'admin') throw new HttpException({ error: 'forbidden' }, 403);
    return true;
  }
}

/** Rate-limit keys for one login attempt: the ip+login pair, and the ip alone (looser cap). */
export function loginLimitKeys(ip: string | undefined, login: string) {
  const address = (ip || 'local').replace('::ffff:', '');
  return { pair: `${address}|${login.trim().toLowerCase()}`, ip: `ip:${address}` };
}

function limitFor(key: string) {
  const pairMax = Number(process.env.LOGIN_MAX_FAILS ?? 10);
  return key.startsWith('ip:') ? Number(process.env.LOGIN_MAX_FAILS_PER_IP ?? pairMax * 5) : pairMax;
}

export function assertLoginAllowed(...keys: string[]) {
  for (const key of keys) {
    const row = fails.get(key);
    if (row && row.reset > Date.now() && row.count >= limitFor(key)) {
      throw new HttpException({ error: 'rate_limited' }, 429);
    }
  }
}

export function recordLoginFailure(...keys: string[]) {
  const now = Date.now();
  for (const key of keys) {
    const row = fails.get(key);
    if (!row || row.reset < now) fails.set(key, { count: 1, reset: now + 15 * 60_000 });
    else row.count += 1;
  }
}

/** On success only the pair is cleared; the per-IP counter keeps limiting password spraying. */
export function clearLoginFailures(key: string) {
  fails.delete(key);
}

export async function openSession(prisma: PrismaService, login: string, password: string) {
  const user = await prisma.user.findUnique({ where: { login } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new HttpException({ error: 'invalid_credentials' }, 401);
  }
  if (!user.isActive) throw new HttpException({ error: 'inactive_user' }, 403);
  const token = newSessionToken();
  await prisma.session.create({
    data: { userId: user.id, tokenHash: hashSessionToken(token), expiresAt: sessionExpiry() },
  });
  return {
    token,
    user: {
      id: user.id,
      login: user.login,
      role: user.role,
      language: user.language,
      theme: user.theme,
      email: user.email,
      emailOptIn: user.emailOptIn,
    },
  };
}
