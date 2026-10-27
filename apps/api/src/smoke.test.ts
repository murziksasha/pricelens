import { describe, expect, it } from 'vitest';
import { isPrivateIp } from './session';

describe('api smoke', () => {
  it('treats loopback as private', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
  });
});
