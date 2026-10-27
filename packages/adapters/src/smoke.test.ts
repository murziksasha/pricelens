import { describe, expect, it } from 'vitest';
import { parseMoney } from './money';

describe('adapters smoke', () => {
  it('parses a price', () => {
    expect(parseMoney('100 грн')?.amount).toBe(100);
  });
});
