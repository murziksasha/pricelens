import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import en from '../../../packages/shared/src/i18n/en.json';

const here = path.dirname(fileURLToPath(import.meta.url));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return full.endsWith('.tsx') ? [full] : [];
  });
}

describe('UI strings FR-UI-001', () => {
  const sources = files(here);

  it('only calls i18n keys that exist', () => {
    const keys = new Set<string>();
    for (const file of sources) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/\bt\(\s*'([^']+)'/g)) keys.add(match[1]!);
    }
    const missing = [...keys].filter((key) => !(key in en) && !key.startsWith('results.'));
    expect(missing).toEqual([]);
  });

  it('does not leave raw JSX text in components', () => {
    const offenders: string[] = [];
    for (const file of sources) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/[A-Za-z0-9"'/]>([^<>{}\n]*[A-Za-zА-Яа-яІіЇїЄєҐґ][^<>{}\n]*)</g)) {
        const value = match[1]!.trim();
        if (value && !value.startsWith('{')) offenders.push(`${path.basename(file)}: ${value}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
