import { describe, expect, it } from 'vitest';
import { hashSessionToken, isPrivateIp, sessionExpired } from './session';

describe('sessions', () => {
  it('expires a token at the deadline', () => {
    const deadline = new Date('2026-10-27T12:00:00Z');
    expect(sessionExpired(deadline, new Date('2026-10-27T12:00:00Z'))).toBe(true);
    expect(sessionExpired(deadline, new Date('2026-10-27T11:59:00Z'))).toBe(false);
  });

  it('hashes tokens stably and allows only LAN addresses by default', () => {
    expect(hashSessionToken('abc')).toBe(hashSessionToken('abc'));
    expect(isPrivateIp('192.168.1.20')).toBe(true);
    expect(isPrivateIp('8.8.8.8')).toBe(false);
  });
});
