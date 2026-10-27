/** FR-CMP-006 deal score and expected profit. Domain math lives only in this package. */

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export type DealLabel = 'insufficient' | 'deal' | 'yellow' | 'neutral';

export interface DealScore {
  score: number | null;
  label: DealLabel;
  median: number | null;
  samples: number;
}

/** score = (medianUsed - price) / median. Needs >= 3 samples. */
export function dealScore(
  price: number,
  samples: number[],
  thresholds: { green?: number; yellow?: number } = {},
): DealScore {
  const green = thresholds.green ?? 0.2;
  const yellow = thresholds.yellow ?? 0.1;
  const usable = samples.filter((n) => Number.isFinite(n) && n > 0);
  if (usable.length < 3 || !Number.isFinite(price)) {
    return { score: null, label: 'insufficient', median: null, samples: usable.length };
  }
  const med = median(usable);
  if (!Number.isFinite(med) || med <= 0) {
    return { score: null, label: 'insufficient', median: null, samples: usable.length };
  }
  const score = (med - price) / med;
  let label: DealLabel = 'neutral';
  if (score >= green) label = 'deal';
  else if (score >= yellow) label = 'yellow';
  return { score, label, median: med, samples: usable.length };
}

export function expectedProfit(input: {
  expectedSalePrice: number;
  listingPrice: number;
  costs: number;
}): number {
  return input.expectedSalePrice - input.listingPrice - input.costs;
}

export const DEFAULT_MIN_MARGIN_UAH = 1500;
