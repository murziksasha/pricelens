import { describe, expect, it } from 'vitest';
import { allocateSale, weightedMedian } from './sale-allocation';
describe('allocateSale', () => {
  it('single position: per-unit = total / qty', () => {
    expect(allocateSale(3_000_000, [{ id: 'a', qty: 2, unitBuyKop: 1_000_000 }])).toEqual([{ id: 'a', saleTotalKop: 3_000_000, saleUnitKop: 1_500_000, method: 'single' }]);
  });
  it('lot of 2 models: proportional to buy cost, sums exactly', () => {
    const r = allocateSale(4_500_000, [
      { id: 't480', qty: 2, unitBuyKop: 800_000 },   // cost 16 000 грн
      { id: 'mac', qty: 1, unitBuyKop: 1_400_000 },  // cost 14 000 грн
    ]);
    expect(r.map((x) => x.saleTotalKop)).toEqual([2_400_000, 2_100_000]);
    expect(r.map((x) => x.saleUnitKop)).toEqual([1_200_000, 2_100_000]);
    expect(r.reduce((s, x) => s + x.saleTotalKop, 0)).toBe(4_500_000);
  });
  it('rounding remainder goes to largest fraction; total preserved', () => {
    const r = allocateSale(1_000_001, [{ id: 'a', qty: 1, unitBuyKop: 1 }, { id: 'b', qty: 1, unitBuyKop: 1 }, { id: 'c', qty: 1, unitBuyKop: 1 }]);
    expect(r.reduce((s, x) => s + x.saleTotalKop, 0)).toBe(1_000_001);
  });
  it('manual override wins; rest split proportionally', () => {
    const r = allocateSale(3_000_000, [{ id: 'a', qty: 1, unitBuyKop: 500_000, manualSaleKop: 2_000_000 }, { id: 'b', qty: 2, unitBuyKop: 300_000 }]);
    expect(r).toEqual([
      { id: 'a', saleTotalKop: 2_000_000, saleUnitKop: 2_000_000, method: 'manual' },
      { id: 'b', saleTotalKop: 1_000_000, saleUnitKop: 500_000, method: 'proportional' },
    ]);
  });
  it('zero buy cost (gift/free) falls back to equal per unit', () => {
    const r = allocateSale(900_000, [{ id: 'a', qty: 2, unitBuyKop: 0 }, { id: 'b', qty: 1, unitBuyKop: 0 }]);
    expect(r.map((x) => x.saleTotalKop)).toEqual([600_000, 300_000]);
    expect(r[0]!.method).toBe('equal');
  });
  it('rejects manual parts larger than total', () => {
    expect(() => allocateSale(100, [{ id: 'a', qty: 1, unitBuyKop: 1, manualSaleKop: 200 }, { id: 'b', qty: 1, unitBuyKop: 1 }])).toThrow('manual_exceeds_total');
  });
});
describe('weightedMedian', () => {
  it('weights by units', () => {
    expect(weightedMedian([{ value: 12000, weight: 3 }, { value: 20000, weight: 1 }])).toBe(12000);
    expect(weightedMedian([{ value: 10000, weight: 1 }, { value: 14000, weight: 1 }])).toBe(12000);
    expect(weightedMedian([])).toBeNull();
  });
});
