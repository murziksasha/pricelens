import { describe, expect, it } from 'vitest';
import { assertSafeBackupName, backupsToDelete, isBackupPayload, parseBackupName } from './backup-files';

const file = (name: string, mtimeMs: number, kind: 'auto' | 'manual' | 'safety' = 'manual') => ({ name, mtimeMs, size: 10, kind });

describe('backup rotation FR-ADM-004', () => {
  it('keeps the 10 newest of 12 files', () => {
    const files = Array.from({ length: 12 }, (_, index) => file(`pricelens-n${index}-manual.dump`, index));
    const dropped = backupsToDelete(files, 10);
    expect(dropped.sort()).toEqual(['pricelens-n0-manual.dump', 'pricelens-n1-manual.dump']);
  });

  it('never deletes a protected backup (the one being restored)', () => {
    const files = Array.from({ length: 10 }, (_, index) => file(`pricelens-n${index}-manual.dump`, index));
    files.push(file('pricelens-s-safety.dump', 100, 'safety'));
    expect(backupsToDelete(files, 10, ['pricelens-n0-manual.dump'])).toEqual([]);
  });

  it('safety backups do not push out auto/manual ones; 3 newest safety kept', () => {
    const files = [
      ...Array.from({ length: 10 }, (_, index) => file(`pricelens-n${index}-auto.dump`, index, 'auto')),
      ...Array.from({ length: 5 }, (_, index) => file(`pricelens-s${index}-safety.dump`, 100 + index, 'safety')),
    ];
    expect(backupsToDelete(files, 10).sort()).toEqual(['pricelens-s0-safety.dump', 'pricelens-s1-safety.dump']);
  });

  it('accepts only pg_dump custom-format payloads', () => {
    expect(isBackupPayload(Buffer.from('PGDMP\u0001'))).toBe(true);
    expect(isBackupPayload(Buffer.from([0x1f, 0x8b, 0, 0, 0]))).toBe(false);
    expect(isBackupPayload(Buffer.from('-- PostgreSQL database dump'))).toBe(false);
    expect(isBackupPayload(Buffer.from('hello'))).toBe(false);
  });

  it('only .dump names are valid', () => {
    expect(parseBackupName('pricelens-x-manual.dump')).toBe('manual');
    expect(parseBackupName('pricelens-x-manual.sql')).toBeNull();
    expect(() => assertSafeBackupName('../pricelens-x-manual.dump')).toThrow();
  });
});
