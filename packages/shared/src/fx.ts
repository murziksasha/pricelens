/** FR-ADM-002 currency rates. Rates map a currency code to UAH per 1 unit; UAH is always 1. */
export type Rates = Record<string, number>;

export const FX_CURRENCIES = ['USD', 'EUR'] as const;

export function toUah(amount: number, currency: string | null | undefined, rates: Rates): number | null {
  if (!Number.isFinite(amount)) return null;
  const cur = (currency || 'UAH').toUpperCase();
  if (cur === 'UAH') return amount;
  const rate = rates[cur];
  return rate && Number.isFinite(rate) && rate > 0 ? Math.round(amount * rate * 100) / 100 : null;
}

/** Picks the rate to use: manual wins in manual mode, otherwise NBU, falling back to manual. */
export function pickRate(input: { mode: string; manual: number; nbu: number; spreadPct: number }): number | null {
  const manual = Number.isFinite(input.manual) && input.manual > 0 ? input.manual : 0;
  const nbu = Number.isFinite(input.nbu) && input.nbu > 0 ? input.nbu : 0;
  const base = input.mode === 'manual' && manual > 0 ? manual : nbu || manual;
  if (!base) return null;
  const spread = 1 + (Number.isFinite(input.spreadPct) ? input.spreadPct : 0) / 100;
  return Math.round(base * spread * 1e6) / 1e6;
}

/** Parses NBU `statdirectory/exchange?json` rows into { currency, date (UTC midnight), rate }. */
export function parseNbuRates(rows: unknown): Array<{ currency: string; date: Date; rate: number }> {
  if (!Array.isArray(rows)) return [];
  const out: Array<{ currency: string; date: Date; rate: number }> = [];
  for (const row of rows) {
    const r = row as { cc?: unknown; rate?: unknown; exchangedate?: unknown };
    if (typeof r.cc !== 'string' || !(FX_CURRENCIES as readonly string[]).includes(r.cc)) continue;
    const rate = Number(r.rate);
    const m = typeof r.exchangedate === 'string' ? r.exchangedate.match(/^(\d{2})\.(\d{2})\.(\d{4})$/) : null;
    if (!m || !Number.isFinite(rate) || rate <= 0) continue;
    out.push({ currency: r.cc, date: new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00Z`), rate });
  }
  return out;
}
