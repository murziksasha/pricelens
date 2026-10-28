import type { PrismaClient } from '@pricelens/db';
import { FX_CURRENCIES, parseNbuRates, pickRate, type Rates } from '@pricelens/shared';

export const NBU_RATES_URL = 'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json';

/** Stores today's NBU USD/EUR rates. Idempotent (upsert per currency + date). */
export async function refreshNbuRates(prisma: PrismaClient, fetchImpl: typeof fetch = fetch): Promise<number> {
  const res = await fetchImpl(NBU_RATES_URL, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`nbu_${res.status}`);
  const rows = parseNbuRates(await res.json());
  for (const row of rows) {
    await prisma.exchangeRate.upsert({
      where: { currency_date_source: { currency: row.currency, date: row.date, source: 'nbu' } },
      create: { currency: row.currency, date: row.date, source: 'nbu', rateToUah: row.rate },
      update: { rateToUah: row.rate },
    });
  }
  return rows.length;
}

/** Latest usable rate per currency (see pickRate). Settings come from readSettings(). */
export async function loadRates(prisma: PrismaClient, settings: Record<string, unknown>): Promise<Rates> {
  const rates: Rates = { UAH: 1 };
  for (const cur of FX_CURRENCIES) {
    const latest = await prisma.exchangeRate.findFirst({
      where: { currency: cur, source: 'nbu' },
      orderBy: { date: 'desc' },
    });
    const rate = pickRate({
      mode: String(settings.fx_mode ?? 'nbu'),
      manual: Number(settings[`fx_${cur.toLowerCase()}_uah`] ?? 0),
      nbu: latest ? Number(latest.rateToUah) : 0,
      spreadPct: Number(settings.fx_spread_pct ?? 0),
    });
    if (rate) rates[cur] = rate;
  }
  return rates;
}

/** Date of the newest stored NBU rate, for the admin settings page. */
export async function latestRateInfo(prisma: PrismaClient) {
  const rows = await Promise.all(
    FX_CURRENCIES.map((currency) =>
      prisma.exchangeRate.findFirst({ where: { currency, source: 'nbu' }, orderBy: { date: 'desc' } }),
    ),
  );
  return rows
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .map((row) => ({ currency: row.currency, rate: Number(row.rateToUah), date: row.date.toISOString().slice(0, 10) }));
}
