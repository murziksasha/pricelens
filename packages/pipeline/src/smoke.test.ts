import { describe, expect, it } from 'vitest';
import { backupFileName } from './backup-files';

describe('pipeline smoke', () => {
  it('names a backup', () => {
    expect(backupFileName('manual', new Date('2026-10-27T00:00:00Z'))).toContain('manual');
  });
});
