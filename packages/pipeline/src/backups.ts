import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertSafeBackupName, backupFileName, backupsToDelete, isBackupPayload, parseBackupName } from './backup-files';

/** Runs a Postgres client tool; on failure the error message carries the tool's stderr. */
function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'pipe'] });
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-2000);
    });
    child.on('error', (error) =>
      reject(Object.assign(new Error(`${command}_unavailable: ${error.message}`), { code: `${command}_unavailable` })),
    );
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(Object.assign(new Error(`${command}_failed: ${stderr.trim()}`), { code: `${command}_failed` })),
    );
  });
}

async function dump(databaseUrl: string, target: string) {
  await run('pg_dump', ['--dbname', databaseUrl, '-Fc', '-f', target]);
}

async function restoreDump(databaseUrl: string, source: string) {
  await run('pg_restore', ['--dbname', databaseUrl, '--clean', '--if-exists', '--no-owner', source]);
}

export async function listBackups(dir: string) {
  await mkdir(dir, { recursive: true });
  const names = await readdir(dir);
  const files = [];
  for (const name of names) {
    const kind = parseBackupName(name);
    if (!kind) continue;
    const info = await stat(path.join(dir, name));
    files.push({ name, kind, size: info.size, mtimeMs: info.mtimeMs });
  }
  return files.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

export async function rotateBackups(dir: string, keep: number, protect: string[] = []) {
  const files = await listBackups(dir);
  for (const name of backupsToDelete(files, keep, protect)) {
    await rm(path.join(dir, name), { force: true });
  }
}

export async function createBackup(
  dir: string,
  databaseUrl: string,
  kind: 'auto' | 'manual' | 'safety',
  keep: number,
  opts: { rotate?: boolean; protect?: string[] } = {},
) {
  await mkdir(dir, { recursive: true });
  const name = backupFileName(kind);
  const finalPath = path.join(dir, name);
  const tempPath = `${finalPath}.partial`;
  try {
    await dump(databaseUrl, tempPath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
  await rename(tempPath, finalPath);
  if (opts.rotate !== false) await rotateBackups(dir, keep, [name, ...(opts.protect ?? [])]);
  return name;
}

/** Restores `name` after taking a safety backup. The restored file is never rotated away. */
export async function restoreBackup(dir: string, databaseUrl: string, name: string, keep: number) {
  assertSafeBackupName(name);
  const source = path.join(dir, name);
  await stat(source).catch(() => {
    throw Object.assign(new Error('not_found'), { code: 'not_found' });
  });
  const safety = await createBackup(dir, databaseUrl, 'safety', keep, { rotate: false });
  await restoreDump(databaseUrl, source);
  await rotateBackups(dir, keep, [name, safety]);
  return { safety };
}

export async function saveUploadedBackup(dir: string, name: string, body: Buffer, keep: number) {
  if (!isBackupPayload(body)) throw Object.assign(new Error('unsupported_format'), { code: 'unsupported_format' });
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, '');
  const stored = parseBackupName(safe) ? safe : backupFileName('manual');
  assertSafeBackupName(stored);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, stored), body);
  await rotateBackups(dir, keep, [stored]);
  return stored;
}

export async function readBackup(dir: string, name: string) {
  assertSafeBackupName(name);
  return readFile(path.join(dir, name));
}

export async function deleteBackup(dir: string, name: string) {
  assertSafeBackupName(name);
  await rm(path.join(dir, name), { force: true });
}
