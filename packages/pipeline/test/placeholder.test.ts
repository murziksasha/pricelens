import { describe, expect, it } from 'vitest';
import { allocateSale } from '@pricelens/shared';

describe('pipeline integration placeholder', () => {
  it('splits a sale total without a database', () => {
    expect(allocateSale(3_000_000, [{ id: 'a', qty: 2, unitBuyKop: 1_000_000 }])[0]!.saleUnitKop).toBe(1_500_000);
  });
});
