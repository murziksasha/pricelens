/** Relative dates such as "Сьогодні 17:43" become a timestamp in Europe/Kyiv. */

function zoneParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
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
    second: Number(bag.second),
  };
}

export function zonedWallToUtc(
  wall: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone = 'Europe/Kyiv',
): Date {
  const desired = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, 0);
  let stamp = desired;
  for (let i = 0; i < 3; i++) {
    const got = zoneParts(new Date(stamp), timeZone);
    const gotUtc = Date.UTC(got.year, got.month - 1, got.day, got.hour, got.minute, got.second);
    const delta = gotUtc - desired;
    if (delta === 0) break;
    stamp -= delta;
  }
  return new Date(stamp);
}

function addDays(year: number, month: number, day: number, delta: number) {
  const date = new Date(Date.UTC(year, month - 1, day + delta));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function parsePostedAt(raw: string, now = new Date(), timeZone = 'Europe/Kyiv'): Date | null {
  if (!raw) return null;
  const text = raw.replace(/\u00a0/g, ' ').trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ t](\d{1,2}):(\d{2}))?/i);
  if (iso) {
    return zonedWallToUtc(
      {
        year: Number(iso[1]),
        month: Number(iso[2]),
        day: Number(iso[3]),
        hour: Number(iso[4] ?? 0),
        minute: Number(iso[5] ?? 0),
      },
      timeZone,
    );
  }
  const dmy = text.match(/(\d{1,2})[./](\d{1,2})[./](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (dmy) {
    const year = dmy[3]!.length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
    return zonedWallToUtc(
      {
        year,
        month: Number(dmy[2]),
        day: Number(dmy[1]),
        hour: Number(dmy[4] ?? 0),
        minute: Number(dmy[5] ?? 0),
      },
      timeZone,
    );
  }
  const time = text.match(/(\d{1,2}):(\d{2})/);
  const hour = time ? Number(time[1]) : 0;
  const minute = time ? Number(time[2]) : 0;
  const today = zoneParts(now, timeZone);
  let shift = 0;
  if (/сьогодні|сегодня|today/i.test(text)) shift = 0;
  else if (/позавчора|позавчера/i.test(text)) shift = -2;
  else if (/вчора|вчера|yesterday/i.test(text)) shift = -1;
  else return null;
  const ymd = addDays(today.year, today.month, today.day, shift);
  return zonedWallToUtc({ ...ymd, hour, minute }, timeZone);
}
