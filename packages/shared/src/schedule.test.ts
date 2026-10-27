import { describe, expect, it } from 'vitest';
import { cacheFresh } from './text';
import { cronMatches, inQuietHoursClock, scheduleDue, shouldNotify } from './schedule';

describe('schedule and quiet hours', () => {
  it('wraps quiet hours across midnight', () => {
    expect(inQuietHoursClock(23, 15, '22:00', '08:00')).toBe(true);
    expect(inQuietHoursClock(7, 0, '22:00', '08:00')).toBe(true);
    expect(inQuietHoursClock(12, 0, '22:00', '08:00')).toBe(false);
    expect(inQuietHoursClock(8, 0, '22:00', '08:00')).toBe(false);
  });

  it('honours an interval floor and runs a missed interval once', () => {
    const now = new Date('2026-10-27T12:00:00Z');
    expect(
      scheduleDue({
        intervalMinutes: 60,
        lastRunAt: new Date(now.getTime() - 30 * 60_000),
        now,
      }),
    ).toBe(false);
    expect(
      scheduleDue({
        intervalMinutes: 60,
        lastRunAt: new Date(now.getTime() - 90 * 60_000),
        now,
      }),
    ).toBe(true);
    expect(scheduleDue({ intervalMinutes: 15, lastRunAt: null, now })).toBe(true);
  });

  it('matches a simple cron minute', () => {
    const morning = new Date('2026-10-27T00:30:00Z');
    expect(cronMatches('30 3 * * *', morning) || cronMatches('30 2 * * *', morning)).toBe(true);
  });

  it('keeps the poll-interval cache floor', () => {
    const now = new Date('2026-10-27T12:00:00Z');
    expect(cacheFresh(new Date(now.getTime() - 10 * 60_000), now, 30)).toBe(true);
    expect(cacheFresh(new Date(now.getTime() - 40 * 60_000), now, 30)).toBe(false);
  });

  it('evaluates notification rules', () => {
    const now = new Date('2026-10-27T10:00:00Z');
    expect(shouldNotify({ onlyNew: true, priceDrop: false, dealThreshold: false }, { isNew: false, priceDropped: true, deal: false }, now)).toBe(false);
    expect(shouldNotify({ onlyNew: false, priceDrop: true, dealThreshold: true }, { isNew: false, priceDropped: false, deal: true }, now)).toBe(true);
    expect(
      shouldNotify(
        { onlyNew: true, priceDrop: false, dealThreshold: false, quietStart: '00:00', quietEnd: '23:59' },
        { isNew: true, priceDropped: false, deal: false },
        now,
      ),
    ).toBe(false);
  });
});
