import { describe, expect, it } from 'vitest';
import { backupsToDelete, isBackupPayload } from './backup-files';

describe('backup rotation FR-ADM-004', () => {
  it('keeps the 10 newest of 12 files', () => {
    const files = Array.from({ length: 12 }, (_, index) => ({
      name: `pricelens-n${index}-manual.dump`,
      mtimeMs: index,
      size: 10,
      kind: 'manual' as const,
    }));
    const dropped = backupsToDelete(files, 10);
    expect(dropped.sort()).toEqual(['pricelens-n0-manual.dump', 'pricelens-n1-manual.dump']);
  });

  it('accepts custom and gzip dumps and rejects junk', () => {
    expect(isBackupPayload(Buffer.from('PGDMP'))).toBe(true);
    expect(isBackupPayload(Buffer.from([0x1f, 0x8b, 0, 0, 0]))).toBe(true);
    expect(isBackupPayload(Buffer.from('-- PostgreSQL database dump'))).toBe(true);
    expect(isBackupPayload(Buffer.from('hello'))).toBe(false);
  });
});
