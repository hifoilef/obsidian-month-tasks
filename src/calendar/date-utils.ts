import type { Task } from '../parser';

/** One calendar cell in a Monday-first month grid. */
export interface CalendarDay {
  date: Date;
  isoDate: string;
  isCurrentMonth: boolean;
}

/** Creates a local date at noon to avoid daylight-saving midnight edges. */
function localDate(year: number, month: number, day: number): Date {
  return new Date(year, month, day, 12, 0, 0, 0);
}

/** Formats a local Date as YYYY-MM-DD. */
export function formatIsoDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Strictly parses a real YYYY-MM-DD calendar date. */
export function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (match === null) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return null;

  const date = localDate(year, month - 1, day);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

/** Selects this milestone's single display date, skipping invalid values. */
export function getRenderableTaskDate(
  task: Pick<Task, 'due' | 'start'>,
): string | null {
  const dateValue = task.due ?? task.start;
  if (dateValue === undefined) return null;
  const date = parseIsoDate(dateValue);
  return date === null ? null : formatIsoDate(date);
}

/** Returns the ISO-8601 week number for a local calendar date. */
export function getIsoWeekNumber(date: Date): number {
  const target = new Date(Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ));
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil((((target.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
}

/** Builds complete Monday-to-Sunday weeks covering the requested month. */
export function buildMonthWeeks(year: number, month: number): CalendarDay[][] {
  const firstDay = localDate(year, month, 1);
  const lastDay = localDate(year, month + 1, 0);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const sundayOffset = 6 - ((lastDay.getDay() + 6) % 7);
  const cursor = localDate(year, month, 1 - mondayOffset);
  const end = localDate(year, month + 1, sundayOffset);
  const weeks: CalendarDay[][] = [];
  let currentWeek: CalendarDay[] = [];

  while (cursor <= end) {
    const date = localDate(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
    currentWeek.push({
      date,
      isoDate: formatIsoDate(date),
      isCurrentMonth: date.getMonth() === month && date.getFullYear() === year,
    });

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return weeks;
}

/** Returns a normalized date for the first day of a month. */
export function startOfMonth(date: Date): Date {
  return localDate(date.getFullYear(), date.getMonth(), 1);
}
