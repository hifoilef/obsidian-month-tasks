import type { Task } from '../parser';
import type { WeekBarSegment } from './layout-week-bars';

export interface SingleTaskPlacement {
  task: Task;
  row: number;
}

export interface DayRowLayout {
  visibleSingleTasks: SingleTaskPlacement[];
  hiddenCount: number;
}

/** Places single-day tasks into rows not occupied by bars on that date. */
export function layoutDayRows(
  barSegments: WeekBarSegment[],
  singleDayTasks: Task[],
  maxRows: number,
): DayRowLayout {
  const occupiedRows = new Set(
    barSegments
      .map((segment) => segment.lane)
      .filter((lane) => lane >= 0 && lane < maxRows),
  );
  const freeRows = Array.from({ length: maxRows }, (_, row) => row)
    .filter((row) => !occupiedRows.has(row));
  const visibleSingleTasks = singleDayTasks
    .slice(0, freeRows.length)
    .map((task, index) => ({ task, row: freeRows[index] ?? 0 }));
  const displayedBarCount = barSegments.filter(
    (segment) => segment.lane >= 0 && segment.lane < maxRows,
  ).length;

  return {
    visibleSingleTasks,
    hiddenCount: barSegments.length + singleDayTasks.length
      - displayedBarCount
      - visibleSingleTasks.length,
  };
}
