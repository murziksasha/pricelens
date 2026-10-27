export interface BackupFile {
  name: string;
  mtimeMs: number;
  size: number;
  kind: 'auto' | 'manual' | 'safety';
}

const NAME = /^pricelens-[\w.-]+-(auto|manual|safety)\.(dump|sql|sql\.gz)$/;

export function backupFileName(kind: 'auto' | 'manual' | 'safety', now = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return `pricelens-${stamp}-${kind}.dump`;
}

export function parseBackupName(name: string): BackupFile['kind'] | null {
  const match = name.match(NAME);
  return (match?.[1] as BackupFile['kind']) ?? null;
}

/** FR-ADM-004 keep the N most recent backups. */
export function backupsToDelete(files: BackupFile[], keep: number): string[] {
  const sorted = [...files].sort((a, b) => b.mtimeMs - a.mtimeMs);
  return sorted.slice(Math.max(0, keep)).map((file) => file.name);
}

export function assertSafeBackupName(name: string): void {
  if (!NAME.test(name) || name.includes('..') || name.includes('/') || name.includes('\\')) {
    throw Object.assign(new Error('invalid_backup'), { code: 'invalid_backup' });
  }
}

export function isBackupPayload(buf: Buffer): boolean {
  if (buf.length < 5) return false;
  if (buf.subarray(0, 5).toString('utf8') === 'PGDMP') return true;
  if (buf[0] === 0x1f && buf[1] === 0x8b) return true;
  const head = buf.subarray(0, 80).toString('utf8');
  return head.startsWith('--') || head.startsWith('SET ') || head.startsWith('PGDMP');
}
