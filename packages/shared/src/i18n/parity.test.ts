import { describe, expect, it } from 'vitest';
import { en, ru, uk } from './index';

describe('i18n key parity FR-UI-001', () => {
  it('keeps the same keys in en, ru and uk', () => {
    const enKeys = Object.keys(en).sort();
    const ruKeys = Object.keys(ru).sort();
    const ukKeys = Object.keys(uk).sort();
    expect(ruKeys).toEqual(enKeys);
    expect(ukKeys).toEqual(enKeys);
    for (const key of enKeys) {
      expect(en[key as keyof typeof en].length).toBeGreaterThan(0);
      expect(ru[key as keyof typeof ru].length).toBeGreaterThan(0);
      expect(uk[key as keyof typeof uk].length).toBeGreaterThan(0);
    }
  });
});
