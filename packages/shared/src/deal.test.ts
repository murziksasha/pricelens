import { describe, expect, it } from 'vitest';
import { dealScore, expectedProfit, median } from './deal';

describe('dealScore FR-CMP-006', () => {
  it('returns insufficient data below 3 samples', () => {
    expect(dealScore(100, [90, 110]).label).toBe('insufficient');
    expect(dealScore(100, []).score).toBeNull();
  });

  it('uses the median of used prices', () => {
    const result = dealScore(8000, [10000, 12000, 11000]);
    expect(result.median).toBe(11000);
    expect(result.score).toBeCloseTo((11000 - 8000) / 11000);
    expect(result.label).toBe('deal');
  });

  it('averages the two middle values for an even sample count', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('classifies the yellow band and a neutral score', () => {
    expect(dealScore(9000, [10000, 10000, 10000]).label).toBe('yellow');
    expect(dealScore(9500, [10000, 10000, 10000]).label).toBe('neutral');
    expect(dealScore(15000, [10000, 10000, 10000]).label).toBe('neutral');
  });

  it('rejects a zero median', () => {
    expect(dealScore(10, [0, 0, 0]).label).toBe('insufficient');
  });

  it('subtracts configurable costs from expected profit', () => {
    expect(expectedProfit({ expectedSalePrice: 20000, listingPrice: 12000, costs: 1500 })).toBe(6500);
  });
});
