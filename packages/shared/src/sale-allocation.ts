/**
 * 1.2a: a purchase's sale price is the TOTAL for the whole purchase. This splits it across positions:
 * - one position: saleUnit = total / qty ('single')
 * - several: proportional to each position's buy cost unitBuy * qty ('proportional')
 * - a position with a manual amount keeps it; the rest is split proportionally ('manual')
 * - zero buy cost everywhere: equal per unit ('equal')
 * All money is in kopecks (integers); largest-remainder rounding keeps the sum exact.
 */
export interface PositionIn {
  id: string;
  qty: number;                     // units in this position, >= 1
  unitBuyKop: number;              // buy price per unit, kopecks
  manualSaleKop?: number | null;   // optional manual sale total for this position
}
export interface PositionOut {
  id: string;
  saleTotalKop: number;
  saleUnitKop: number;             // per-unit, rounded; saleTotalKop / qty
  method: 'single' | 'manual' | 'proportional' | 'equal';
}

export function allocateSale(totalKop: number, positions: PositionIn[]): PositionOut[] {
  if (positions.length === 0) return [];
  if (positions.length === 1) {
    const p = positions[0]!;
    return [{ id: p.id, saleTotalKop: totalKop, saleUnitKop: Math.round(totalKop / p.qty), method: 'single' }];
  }
  const manual = positions.filter((p) => p.manualSaleKop != null);
  const auto = positions.filter((p) => p.manualSaleKop == null);
  const manualSum = manual.reduce((s, p) => s + p.manualSaleKop!, 0);
  if (manualSum > totalKop) throw Object.assign(new Error('manual_exceeds_total'), { code: 'manual_exceeds_total' });
  const rest = totalKop - manualSum;
  const costs = auto.map((p) => p.unitBuyKop * p.qty);
  const costSum = costs.reduce((a, b) => a + b, 0);
  const useEqual = costSum <= 0;
  const weights = useEqual ? auto.map((p) => p.qty) : costs;
  const weightSum = weights.reduce((a, b) => a + b, 0);
  // largest-remainder rounding so the parts add up exactly to `rest`
  const raw = weights.map((w) => (weightSum > 0 ? (rest * w) / weightSum : 0));
  const floors = raw.map(Math.floor);
  let left = rest - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - floors[i]!, i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (left <= 0) break; floors[i]! += 1; left -= 1; }
  const out = new Map<string, PositionOut>();
  manual.forEach((p) => out.set(p.id, { id: p.id, saleTotalKop: p.manualSaleKop!, saleUnitKop: Math.round(p.manualSaleKop! / p.qty), method: 'manual' }));
  auto.forEach((p, i) => out.set(p.id, { id: p.id, saleTotalKop: floors[i]!, saleUnitKop: Math.round(floors[i]! / p.qty), method: useEqual ? 'equal' : 'proportional' }));
  return positions.map((p) => out.get(p.id)!);
}

/** Median weighted by units: a position with qty 3 counts as 3 sales at its per-unit price. */
export function weightedMedian(points: Array<{ value: number; weight: number }>): number | null {
  const v = points.filter((p) => Number.isFinite(p.value) && p.value > 0 && p.weight > 0).sort((a, b) => a.value - b.value);
  const total = v.reduce((s, p) => s + p.weight, 0);
  if (total === 0) return null;
  let acc = 0;
  for (let i = 0; i < v.length; i++) {
    acc += v[i]!.weight;
    if (acc * 2 > total) return v[i]!.value;
    if (acc * 2 === total) return (v[i]!.value + v[i + 1]!.value) / 2;
  }
  return v[v.length - 1]!.value;
}

export function toKop(amount: number): number {
  return Math.round(amount * 100);
}

export function fromKop(kop: number): number {
  return kop / 100;
}
