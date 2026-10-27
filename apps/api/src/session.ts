import { createHash, randomBytes } from 'node:crypto';

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function sessionExpired(expiresAt: Date, now = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

export function sessionExpiry(now = new Date()): Date {
  const hours = Number(process.env.SESSION_TTL_HOURS ?? 168);
  return new Date(now.getTime() + hours * 3600_000);
}

export function isPrivateIp(ip: string): boolean {
  const host = ip.replace('::ffff:', '');
  if (host === '127.0.0.1' || host === '::1' || host === 'localhost') return true;
  if (host.startsWith('10.') || host.startsWith('192.168.') || host.startsWith('fc') || host.startsWith('fd')) return true;
  return /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
}
