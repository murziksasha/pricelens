import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { toCsv, toXlsx } from './sheet';

describe('export FR-CMP-007', () => {
  it('builds csv and a readable xlsx sheet', () => {
    const rows = [
      ['title', 'price'],
      ['Dell, "used"', '12000'],
    ];
    expect(toCsv(rows)).toContain('"Dell, ""used"""');
    const zipped = unzipSync(toXlsx(rows));
    const sheet = new TextDecoder().decode(zipped['xl/worksheets/sheet1.xml']);
    expect(sheet).toContain('Dell');
    expect(sheet).toContain('12000');
  });
});
