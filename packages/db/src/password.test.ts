import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('argon2 passwords', () => {
  it('verifies the right password and rejects the wrong one', async () => {
    const hash = await hashPassword('correct-horse');
    expect(await verifyPassword('correct-horse', hash)).toBe(true);
    expect(await verifyPassword('nope', hash)).toBe(false);
  });
});
