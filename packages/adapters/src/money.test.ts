import { describe, expect, it } from 'vitest';
import { parsePostedAt } from './dates';
import { parseMoney, parseMoneyInText } from './money';

describe('parseMoney', () => {
  it('reads Ukrainian and US price formats', () => {
    expect(parseMoney('12 000 грн')).toEqual({ amount: 12000, currency: 'UAH' });
    expect(parseMoney('12 000,50 грн')?.amount).toBeCloseTo(12000.5);
    expect(parseMoney('1,299.00 USD')).toEqual({ amount: 1299, currency: 'USD' });
    expect(parseMoney('1.299,00 €')?.amount).toBeCloseTo(1299);
    expect(parseMoney('$1,299')?.currency).toBe('USD');
  });
});

describe('parsePostedAt', () => {
  const now = new Date('2026-10-27T10:00:00Z');

  it('maps today and yesterday onto the Kyiv wall clock', () => {
    const today = parsePostedAt('Сьогодні 17:43', now);
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Kyiv',
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      hourCycle: 'h23',
    });
    expect(fmt.format(today!)).toContain('17:43');
    const yesterday = parsePostedAt('Вчора 09:10', now);
    const todayDay = fmt.format(today!).slice(0, 2);
    const yDay = fmt.format(yesterday!).slice(0, 2);
    expect(yDay).not.toBe(todayDay);
    expect(fmt.format(yesterday!)).toContain('09:10');
    expect(parsePostedAt('Сегодня 17:43', now)?.toISOString()).toBe(today?.toISOString());
  });
});

describe('parseMoneyInText', () => {
  it('takes the amount written next to a currency, not sizes or codes before it', () => {
    expect(parseMoneyInText('Ноутбук 15.6" код: U1144508 в наявності 39999 грн')).toEqual({ amount: 39999, currency: 'UAH' });
    expect(parseMoneyInText('Ноутбук 14" 1920x1080 IPS 14 500 ₴ 18 000 ₴')).toEqual({ amount: 14500, currency: 'UAH' });
    expect(parseMoneyInText('$ 499')).toEqual({ amount: 499, currency: 'USD' });
    expect(parseMoneyInText('53221.0')).toEqual({ amount: 53221, currency: null });
  });
});
