import { describe, expect, it } from 'vitest';
import { scheduleDue } from '@pricelens/shared';

describe('worker smoke', () => {
  it('sees a never-run schedule as due', () => {
    expect(scheduleDue({ intervalMinutes: 15, lastRunAt: null, now: new Date() })).toBe(true);
  });
});
