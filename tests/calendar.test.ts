import { describe, expect, it } from 'vitest';
import {
  buildMonthWeeks,
  formatIsoDate,
  getRenderableTaskDate,
  getIsoWeekNumber,
  parseIsoDate,
} from '../src/calendar/date-utils';

describe('calendar date utilities', () => {
  it('formats local time near midnight without converting through UTC', () => {
    expect(formatIsoDate(new Date(2026, 9, 20, 0, 5))).toBe('2026-10-20');
  });

  it('strictly accepts real ISO calendar dates', () => {
    expect(formatIsoDate(parseIsoDate('2026-06-12') as Date)).toBe('2026-06-12');
    expect(formatIsoDate(parseIsoDate('2024-02-29') as Date)).toBe('2024-02-29');
  });

  it('rejects malformed and impossible dates without throwing', () => {
    expect(parseIsoDate('2026-13-45')).toBeNull();
    expect(parseIsoDate('2026-02-29')).toBeNull();
    expect(parseIsoDate('June 12')).toBeNull();
  });

  it('uses due before start and skips tasks with invalid or missing dates', () => {
    expect(getRenderableTaskDate({ due: '2026-06-12' })).toBe('2026-06-12');
    expect(getRenderableTaskDate({ start: '2026-06-10' })).toBe('2026-06-10');
    expect(getRenderableTaskDate({
      start: '2026-06-10',
      due: '2026-06-12',
    })).toBe('2026-06-12');
    expect(getRenderableTaskDate({ due: '2026-13-45' })).toBeNull();
    expect(getRenderableTaskDate({})).toBeNull();
  });

  it('builds complete Monday-first weeks for June 2026', () => {
    const weeks = buildMonthWeeks(2026, 5);

    expect(weeks).toHaveLength(5);
    expect(weeks[0]?.map((day) => day.isoDate)).toEqual([
      '2026-06-01',
      '2026-06-02',
      '2026-06-03',
      '2026-06-04',
      '2026-06-05',
      '2026-06-06',
      '2026-06-07',
    ]);
    expect(weeks.at(-1)?.at(-1)?.isoDate).toBe('2026-07-05');
  });

  it('marks dates outside the displayed month', () => {
    const weeks = buildMonthWeeks(2026, 9);
    const outsideDates = weeks.flat().filter((day) => !day.isCurrentMonth);

    expect(outsideDates.length).toBeGreaterThan(0);
    expect(outsideDates.every((day) => day.date.getMonth() !== 9)).toBe(true);
  });

  it('calculates ISO week numbers across a year boundary', () => {
    const finalDay = parseIsoDate('2021-01-03');
    const firstDay = parseIsoDate('2021-01-04');

    expect(finalDay === null ? null : getIsoWeekNumber(finalDay)).toBe(53);
    expect(firstDay === null ? null : getIsoWeekNumber(firstDay)).toBe(1);
  });
});
