import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('desktop shell ADR-0003', () => {
  it('points the Tauri window at the shared web UI', () => {
    const config = JSON.parse(readFileSync(path.join(__dirname, '../src-tauri/tauri.conf.json'), 'utf8'));
    expect(config.productName).toBe('PriceLens');
    expect(config.app.windows[0].title).toBe('PriceLens');
  });
});
