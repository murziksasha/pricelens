/** FR-SCH schedule math and FR-NTF quiet hours. */

export function inQuietHoursClock(hour: number, minute: number, start: string, end: string): boolean {
  if (!start || !end) return false;
  const cur = hour * 60 + minute;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if ([sh, sm, eh, em].some((n) => !Number.isFinite(n))) return false;
  const from = sh! * 60 + sm!;
  const to = eh! * 60 + em!;
  if (from === to) return false;
  if (from < to) return cur >= from && cur < to;
  return cur >= from || cur < to;
}

export function kyivParts(date: Date): { year: number; month: number; day: number; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const bag: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) bag[part.type] = part.value;
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: Number(bag.hour),
    minute: Number(bag.minute),
  };
}

export function inQuietHours(now: Date, start: string, end: string): boolean {
  const parts = kyivParts(now);
  return inQuietHoursClock(parts.hour, parts.minute, start, end);
}

function fieldMatch(field: string, value: number, min: number, _max: number): boolean {
  if (field === '*') return true;
  return field.split(',').some((part) => {
    const [base, stepRaw] = part.split('/');
    const step = stepRaw ? Number(stepRaw) : null;
    if (base === '*' && step) return (value - min) % step === 0;
    if (base?.includes('-')) {
      const [a, b] = base.split('-').map(Number);
      if (value < a! || value > b!) return false;
      return step ? (value - a!) % step === 0 : true;
    }
    if (step) return false;
    return Number(base) === value;
  });
}

export function cronMatches(cron: string, date: Date): boolean {
  const bits = cron.trim().split(/\s+/);
  if (bits.length !== 5) return false;
  const parts = kyivParts(date);
  const dow = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  return (
    fieldMatch(bits[0]!, parts.minute, 0, 59) &&
    fieldMatch(bits[1]!, parts.hour, 0, 23) &&
    fieldMatch(bits[2]!, parts.day, 1, 31) &&
    fieldMatch(bits[3]!, parts.month, 1, 12) &&
    fieldMatch(bits[4]!, dow, 0, 6)
  );
}

export interface ScheduleShape {
  intervalMinutes?: number | null;
  dailyTime?: string | null;
  cron?: string | null;
  lastRunAt: Date | null;
  now: Date;
}

/** A schedule is due once when any tick was missed while the host was off (FR-SCH). */
export function scheduleDue(input: ScheduleShape): boolean {
  if (!input.lastRunAt) return true;
  if (input.now.getTime() <= input.lastRunAt.getTime()) return false;
  if (input.intervalMinutes && input.intervalMinutes > 0) {
    return input.now.getTime() - input.lastRunAt.getTime() >= input.intervalMinutes * 60_000;
  }
  const cron = input.dailyTime
    ? `${Number(input.dailyTime.split(':')[1])} ${Number(input.dailyTime.split(':')[0])} * * *`
    : input.cron || '';
  if (!cron) return false;
  if (input.now.getTime() - input.lastRunAt.getTime() > 8 * 86_400_000) return true;
  let cursor = input.lastRunAt.getTime() + 60_000;
  const end = input.now.getTime();
  let steps = 0;
  while (cursor <= end && steps < 60 * 24 * 8) {
    if (cronMatches(cron, new Date(cursor))) return true;
    cursor += 60_000;
    steps++;
  }
  return false;
}

export interface NotifyRules {
  onlyNew: boolean;
  priceDrop: boolean;
  dealThreshold: boolean;
  quietStart?: string;
  quietEnd?: string;
}

export function shouldNotify(
  rules: NotifyRules,
  event: { isNew: boolean; priceDropped: boolean; deal: boolean },
  now: Date,
): boolean {
  if (rules.quietStart && rules.quietEnd && inQuietHours(now, rules.quietStart, rules.quietEnd)) {
    return false;
  }
  const gated = rules.onlyNew || rules.priceDrop || rules.dealThreshold;
  if (!gated) return event.isNew;
  if (rules.onlyNew && event.isNew) return true;
  if (rules.priceDrop && event.priceDropped) return true;
  if (rules.dealThreshold && event.deal) return true;
  return false;
}
