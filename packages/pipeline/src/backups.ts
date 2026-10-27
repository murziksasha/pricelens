import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertSafeBackupName, backupFileName, backupsToDelete, isBackupPayload, parseBackupName } from './backup-files';

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command}_failed`))));
  });
}

async function dump(databaseUrl: string, target: string) {
  try {
    await run('pg_dump', ['--dbname', databaseUrl, '-Fc', '-f', target]);
    return;
  } catch (error) {
    const missing = error instanceof Error && /ENOENT|pg_dump_failed/.test(String(error));
    if (!missing) throw error;
  }
  await run('docker', ['compose', 'exec', '-T', 'postgres', 'pg_dump', '-U', 'pricelens', '-Fc', '-f', `/tmp/${path.basename(target)}`]);
  await run('docker', ['compose', 'cp', `postgres:/tmp/${path.basename(target)}`, target]);
}

async function restoreDump(databaseUrl: string, source: string) {
  try {
    await run('pg_restore', ['--dbname', databaseUrl, '--clean', '--if-exists', '--no-owner', source]);
    return;
  } catch (error) {
    const missing = error instanceof Error && /ENOENT|pg_restore_failed/.test(String(error));
    if (!missing) throw error;
  }
  await run('docker', ['compose', 'cp', source, `postgres:/tmp/${path.basename(source)}`]);
  await run('docker', [
    'compose',
    'exec',
    '-T',
    'postgres',
    'pg_restore',
    '-U',
    'pricelens',
    '-d',
    'pricelens',
    '--clean',
    '--if-exists',
    '--no-owner',
    `/tmp/${path.basename(source)}`,
  ]);
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

export async function rotateBackups(dir: string, keep: number) {
  const files = await listBackups(dir);
  for (const name of backupsToDelete(files, keep)) {
    await rm(path.join(dir, name), { force: true });
  }
}

export async function createBackup(dir: string, databaseUrl: string, kind: 'auto' | 'manual' | 'safety', keep: number) {
  await mkdir(dir, { recursive: true });
  const name = backupFileName(kind);
  const finalPath = path.join(dir, name);
  const tempPath = `${finalPath}.partial`;
  await dump(databaseUrl, tempPath);
  await rename(tempPath, finalPath);
  await rotateBackups(dir, keep);
  return name;
}

export async function restoreBackup(dir: string, databaseUrl: string, name: string, keep: number) {
  assertSafeBackupName(name);
  const source = path.join(dir, name);
  await createBackup(dir, databaseUrl, 'safety', keep);
  await restoreDump(databaseUrl, source);
}

export async function saveUploadedBackup(dir: string, name: string, body: Buffer, keep: number) {
  if (!isBackupPayload(body)) throw Object.assign(new Error('invalid_backup'), { code: 'invalid_backup' });
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, '');
  const stored = safe.includes('-manual') || safe.includes('-auto') || safe.includes('-safety') ? safe : backupFileName('manual');
  assertSafeBackupName(stored);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, stored), body);
  await rotateBackups(dir, keep);
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
