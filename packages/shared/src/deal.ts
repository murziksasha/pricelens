/** FR-CMP-006 deal score and expected profit. Domain math lives only in this package. */

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Tukey fences: drop values outside [Q1 - 1.5*IQR, Q3 + 1.5*IQR] when n >= 5, then take the median. */
export function robustMedian(values: number[]): { median: number; kept: number } {
  const v = values.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (v.length < 5) return { median: median(v), kept: v.length };
  const q = (p: number) => {
    const i = (v.length - 1) * p;
    const lo = Math.floor(i);
    return v[lo]! + (v[Math.ceil(i)]! - v[lo]!) * (i - lo);
  };
  const q1 = q(0.25);
  const q3 = q(0.75);
  const iqr = q3 - q1;
  const kept = v.filter((n) => n >= q1 - 1.5 * iqr && n <= q3 + 1.5 * iqr);
  return { median: median(kept), kept: kept.length };
}

export type DealLabel = 'insufficient' | 'deal' | 'yellow' | 'neutral';

export interface DealScore {
  score: number | null;
  label: DealLabel;
  median: number | null;
  samples: number;
}

/** score = (robust median of used prices - price) / median. Needs >= 3 samples after outlier trimming. */
export function dealScore(
  price: number,
  samples: number[],
  thresholds: { green?: number; yellow?: number } = {},
): DealScore {
  const green = thresholds.green ?? 0.2;
  const yellow = thresholds.yellow ?? 0.1;
  const robust = robustMedian(samples);
  if (robust.kept < 3 || !Number.isFinite(price)) {
    return { score: null, label: 'insufficient', median: null, samples: robust.kept };
  }
  const med = robust.median;
  if (!Number.isFinite(med) || med <= 0) {
    return { score: null, label: 'insufficient', median: null, samples: robust.kept };
  }
  const score = (med - price) / med;
  let label: DealLabel = 'neutral';
  if (score >= green) label = 'deal';
  else if (score >= yellow) label = 'yellow';
  return { score, label, median: med, samples: robust.kept };
}

export function expectedProfit(input: {
  expectedSalePrice: number;
  listingPrice: number;
  costs: number;
}): number {
  return input.expectedSalePrice - input.listingPrice - input.costs;
}

export const DEFAULT_MIN_MARGIN_UAH = 1500;

export type SaleSource = 'manual' | 'own_sales' | 'asking_median' | 'none';

/**
 * FR-CMP-006 expected sale price, in order of trust:
 * 1. manual price set on the product group
 * 2. unit-weighted median of your own realised per-unit sale prices (>= minOwnSales units)
 * 3. median asking price of comparable used listings x askingToSaleRatio
 */
export function expectedSalePrice(input: {
  manual: number | null;
  ownMedian: number | null;
  unitsSold: number;
  askingMedian: number | null;
  askingToSaleRatio: number;
  minOwnSales?: number;
}): { value: number | null; source: SaleSource; samples: number } {
  if (input.manual != null && input.manual > 0) return { value: input.manual, source: 'manual', samples: 0 };
  if (input.ownMedian != null && input.ownMedian > 0 && input.unitsSold >= (input.minOwnSales ?? 2)) {
    return { value: input.ownMedian, source: 'own_sales', samples: input.unitsSold };
  }
  if (input.askingMedian != null && input.askingMedian > 0) {
    const ratio = Number.isFinite(input.askingToSaleRatio) && input.askingToSaleRatio > 0 ? input.askingToSaleRatio : 1;
    return { value: Math.round(input.askingMedian * ratio), source: 'asking_median', samples: 0 };
  }
  return { value: null, source: 'none', samples: 0 };
}
