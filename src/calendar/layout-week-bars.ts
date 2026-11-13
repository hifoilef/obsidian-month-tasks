import type { Task } from '../parser';
import { formatIsoDate, parseIsoDate } from './date-utils';

/** One week-clipped segment of a valid multi-day task. */
export interface WeekBarSegment {
  task: Task;
  weekIndex: number;
  weekStart: string;
  startCol: number;
  endCol: number;
  lane: number;
  continuesLeft: boolean;
  continuesRight: boolean;
}

interface DatedTask {
  task: Task;
  start: Date;
  due: Date;
  duration: number;
}

interface UnplacedSegment extends Omit<WeekBarSegment, 'lane'> {
  startTime: number;
  duration: number;
}

const DAY_MS = 86_400_000;

/** Adds whole calendar days without relying on local elapsed milliseconds. */
function addDays(date: Date, days: number): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + days,
    12,
  );
}

/** Returns the number of calendar days from start to end. */
function daysBetween(start: Date, end: Date): number {
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endUtc - startUtc) / DAY_MS);
}

/** Returns a valid ascending multi-day range, otherwise null. */
function getDatedTask(task: Task): DatedTask | null {
  if (task.start === undefined || task.due === undefined) return null;
  const start = parseIsoDate(task.start);
  const due = parseIsoDate(task.due);
  if (start === null || due === null || start >= due) return null;
  return {
    task,
    start,
    due,
    duration: daysBetween(start, due) + 1,
  };
}

/** Reports whether a task should render as a multi-day bar. */
export function isMultiDayTask(task: Task): boolean {
  return getDatedTask(task) !== null;
}

/** Splits multi-day tasks into weeks and assigns non-overlapping lanes. */
export function layoutWeekBars(
  tasks: Task[],
  visibleStart: string,
  visibleEnd: string,
): WeekBarSegment[] {
  const firstVisibleDay = parseIsoDate(visibleStart);
  const lastVisibleDay = parseIsoDate(visibleEnd);
  if (
    firstVisibleDay === null
    || lastVisibleDay === null
    || firstVisibleDay > lastVisibleDay
  ) {
    return [];
  }

  const datedTasks = tasks
    .map(getDatedTask)
    .filter((task): task is DatedTask => task !== null);
  const unplaced: UnplacedSegment[] = [];

  for (const datedTask of datedTasks) {
    if (datedTask.due < firstVisibleDay || datedTask.start > lastVisibleDay) continue;
    const clippedStart = datedTask.start < firstVisibleDay
      ? firstVisibleDay
      : datedTask.start;
    const clippedEnd = datedTask.due > lastVisibleDay
      ? lastVisibleDay
      : datedTask.due;
    const firstWeek = Math.floor(daysBetween(firstVisibleDay, clippedStart) / 7);
    const lastWeek = Math.floor(daysBetween(firstVisibleDay, clippedEnd) / 7);

    for (let weekIndex = firstWeek; weekIndex <= lastWeek; weekIndex += 1) {
      const weekStart = addDays(firstVisibleDay, weekIndex * 7);
      const weekEnd = addDays(weekStart, 6);
      const segmentStart = datedTask.start > weekStart ? datedTask.start : weekStart;
      const segmentEnd = datedTask.due < weekEnd ? datedTask.due : weekEnd;
      const startCol = daysBetween(weekStart, segmentStart);
      const endCol = daysBetween(weekStart, segmentEnd);

      unplaced.push({
        task: datedTask.task,
        weekIndex,
        weekStart: formatIsoDate(weekStart),
        startCol,
        endCol,
        continuesLeft: datedTask.start < segmentStart,
        continuesRight: datedTask.due > segmentEnd,
        startTime: datedTask.start.getTime(),
        duration: datedTask.duration,
      });
    }
  }

  const result: WeekBarSegment[] = [];
  const weekCount = Math.floor(daysBetween(firstVisibleDay, lastVisibleDay) / 7) + 1;
  for (let weekIndex = 0; weekIndex < weekCount; weekIndex += 1) {
    const segments = unplaced
      .filter((segment) => segment.weekIndex === weekIndex)
      .sort((left, right) => (
        left.startTime - right.startTime
        || right.duration - left.duration
        || left.task.id.localeCompare(right.task.id)
      ));
    const occupiedLanes: boolean[][] = [];

    for (const segment of segments) {
      let lane = 0;
      while (
        occupiedLanes[lane]?.slice(segment.startCol, segment.endCol + 1).some(Boolean)
      ) {
        lane += 1;
      }
      const occupied = occupiedLanes[lane] ?? Array<boolean>(7).fill(false);
      for (let column = segment.startCol; column <= segment.endCol; column += 1) {
        occupied[column] = true;
      }
      occupiedLanes[lane] = occupied;

      result.push({
        task: segment.task,
        weekIndex: segment.weekIndex,
        weekStart: segment.weekStart,
        startCol: segment.startCol,
        endCol: segment.endCol,
        lane,
        continuesLeft: segment.continuesLeft,
        continuesRight: segment.continuesRight,
      });
    }
  }

  return result;
}
