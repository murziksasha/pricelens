export interface BackupFile {
  name: string;
  mtimeMs: number;
  size: number;
  kind: 'auto' | 'manual' | 'safety';
}

/** Only pg_dump custom-format files (-Fc) are created and restorable (pg_restore). */
const NAME = /^pricelens-[\w.-]+-(auto|manual|safety)\.dump$/;

/** Safety backups (taken before a restore) are kept separately from the rotation. */
export const SAFETY_KEEP = 3;

export function backupFileName(kind: 'auto' | 'manual' | 'safety', now = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return `pricelens-${stamp}-${kind}.dump`;
}

export function parseBackupName(name: string): BackupFile['kind'] | null {
  const match = name.match(NAME);
  return (match?.[1] as BackupFile['kind']) ?? null;
}

/**
 * FR-ADM-004 keep the N most recent auto/manual backups plus the SAFETY_KEEP newest safety backups.
 * Names in `protect` (e.g. the backup being restored) are never deleted.
 */
export function backupsToDelete(files: BackupFile[], keep: number, protect: string[] = []): string[] {
  const newestFirst = (a: BackupFile, b: BackupFile) => b.mtimeMs - a.mtimeMs;
  const rotating = files.filter((file) => file.kind !== 'safety' && !protect.includes(file.name)).sort(newestFirst);
  const safeties = files.filter((file) => file.kind === 'safety' && !protect.includes(file.name)).sort(newestFirst);
  return [...rotating.slice(Math.max(0, keep)), ...safeties.slice(SAFETY_KEEP)].map((file) => file.name);
}

export function assertSafeBackupName(name: string): void {
  if (!NAME.test(name) || name.includes('..') || name.includes('/') || name.includes('\\')) {
    throw Object.assign(new Error('invalid_backup'), { code: 'invalid_backup' });
  }
}

/** Accepts pg_dump custom format only ("PGDMP" magic). Plain SQL / gzip cannot be restored with pg_restore. */
export function isBackupPayload(buf: Buffer): boolean {
  return buf.length >= 5 && buf.subarray(0, 5).toString('utf8') === 'PGDMP';
}
