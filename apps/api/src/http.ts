import { HttpException } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from './auth';

export function parse<T>(schema: { safeParse: (body: unknown) => { success: boolean; data?: T } }, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success || result.data === undefined) throw new HttpException({ error: 'validation_error' }, 400);
  return result.data;
}

export function userOf(req: Request): AuthUser {
  return (req as Request & { user: AuthUser }).user;
}
