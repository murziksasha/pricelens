import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@pricelens/shared';

describe('db package smoke', () => {
  it('sees default settings from shared', () => {
    expect(DEFAULT_SETTINGS.backup_keep).toBe(10);
  });
});
