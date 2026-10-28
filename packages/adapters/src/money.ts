export interface Money {
  amount: number;
  currency: string | null;
}

/** FR-CON-006 normaliser: "12 000 грн" -> 12000 UAH. */
export function parseMoney(raw: string): Money | null {
  if (!raw) return null;
  const source = raw.replace(/\u00a0/g, ' ').replace(/\u202f/g, ' ').trim();
  let currency: string | null = null;
  if (/грн|uah|₴/i.test(source)) currency = 'UAH';
  else if (/usd|\$|дол/i.test(source)) currency = 'USD';
  else if (/eur|€/i.test(source)) currency = 'EUR';
  const cleaned = source.replace(/грн|uah|usd|eur|₴|\$|€|долл?\.?/gi, ' ');
  const match = cleaned.match(/(\d[\d\s.,]*)/);
  if (!match) return null;
  let num = match[1]!.replace(/\s/g, '');
  if (num.includes(',') && num.includes('.')) {
    if (num.lastIndexOf(',') > num.lastIndexOf('.')) num = num.replace(/\./g, '').replace(',', '.');
    else num = num.replace(/,/g, '');
  } else if (num.includes(',')) {
    const parts = num.split(',');
    if (parts.length === 2 && parts[1]!.length <= 2) num = `${parts[0]}.${parts[1]}`;
    else num = num.replace(/,/g, '');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(num)) {
    num = num.replace(/\./g, '');
  }
  const amount = Number(num);
  if (!Number.isFinite(amount)) return null;
  return { amount, currency };
}

const AMOUNT = String.raw`\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?`;
const PRICE_IN_TEXT = new RegExp(
  String.raw`(?:(${AMOUNT})\s*(?:грн|uah|₴|usd|\$|eur|€))|(?:(?:\$|€|usd|eur)\s*(${AMOUNT}))`,
  'i',
);

/**
 * Card text mixes sizes, codes and counters with the price ("15.6\" ... код 1144508 ... 39 999 грн").
 * Prefer the first amount written next to a currency; fall back to parseMoney.
 */
export function parseMoneyInText(raw: string): Money | null {
  if (!raw) return null;
  const source = raw.replace(/\u00a0|\u202f/g, ' ');
  const match = PRICE_IN_TEXT.exec(source);
  if (match) return parseMoney(match[0]);
  return parseMoney(source);
}

export function formatThousands(amount: number): string {
  const rounded = Math.round(amount);
  return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
