import { describe, expect, it } from 'vitest';
import { dealScore } from './deal';
import { parseNbuRates, pickRate, toUah } from './fx';

const rates = { UAH: 1, USD: 41.5, EUR: 45 };

describe('toUah FR-ADM-002', () => {
  it('converts known currencies and passes UAH through', () => {
    expect(toUah(450, 'USD', rates)).toBe(18675);
    expect(toUah(100, 'uah', rates)).toBe(100);
    expect(toUah(5, null, rates)).toBe(5);
  });
  it('returns null for an unknown rate', () => {
    expect(toUah(10, 'PLN', rates)).toBeNull();
    expect(toUah(10, 'USD', { UAH: 1 })).toBeNull();
  });
  it('makes a mixed-currency median sane', () => {
    const samples = [
      [15000, 'UAH'],
      [16000, 'UAH'],
      [400, 'USD'],
    ] as const;
    const uah = samples.map(([a, c]) => toUah(a, c, { UAH: 1, USD: 41 })!);
    expect(dealScore(12000, uah).median).toBe(16000);
  });
});

describe('pickRate', () => {
  it('prefers manual in manual mode, NBU otherwise, and applies the spread', () => {
    expect(pickRate({ mode: 'manual', manual: 42, nbu: 41.5, spreadPct: 0 })).toBe(42);
    expect(pickRate({ mode: 'nbu', manual: 42, nbu: 41.5, spreadPct: 0 })).toBe(41.5);
    expect(pickRate({ mode: 'nbu', manual: 42, nbu: 0, spreadPct: 0 })).toBe(42);
    expect(pickRate({ mode: 'nbu', manual: 0, nbu: 40, spreadPct: 2 })).toBe(40.8);
    expect(pickRate({ mode: 'nbu', manual: 0, nbu: 0, spreadPct: 0 })).toBeNull();
  });
});

describe('parseNbuRates', () => {
  it('reads USD and EUR rows from the NBU JSON', () => {
    const parsed = parseNbuRates([
      { r030: 840, txt: 'Долар США', rate: 41.4567, cc: 'USD', exchangedate: '28.10.2026' },
      { r030: 978, txt: 'Євро', rate: 44.9, cc: 'EUR', exchangedate: '28.10.2026' },
      { r030: 985, txt: 'Злотий', rate: 10.4, cc: 'PLN', exchangedate: '28.10.2026' },
    ]);
    expect(parsed.map((r) => r.currency)).toEqual(['USD', 'EUR']);
    expect(parsed[0]!.date.toISOString()).toBe('2026-10-28T00:00:00.000Z');
    expect(parseNbuRates({})).toEqual([]);
  });
});
