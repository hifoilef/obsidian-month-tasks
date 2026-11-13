import type { Task } from '../parser';
import { formatIsoDate, getRenderableTaskDate, parseIsoDate } from './date-utils';

const DAY_MS = 86_400_000;

export interface UpcomingTask {
  task: Task;
  deadline: string;
  overdue: boolean;
}

export interface UpcomingSummary {
  upcomingCount: number;
  overdueCount: number;
  items: UpcomingTask[];
}

export interface UpcomingSummaryOptions {
  upcomingDays: number;
  showOverdue: boolean;
  /** Zero keeps every overdue task; a positive value limits how far back to look. */
  overdueLookbackDays: number;
}

const DEFAULT_UPCOMING_OPTIONS: UpcomingSummaryOptions = {
  upcomingDays: 7,
  showOverdue: true,
  overdueLookbackDays: 0,
};

/** Returns a real Kanban heading while hiding note names used as fallback groups. */
export function getUpcomingGroupLabel(
  task: Pick<Task, 'filePath' | 'group' | 'source'>,
): string | null {
  if (task.source !== 'kanban') return null;
  const fileName = task.filePath.split(/[\\/]/u).pop() ?? task.filePath;
  const lastDot = fileName.lastIndexOf('.');
  const baseName = lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
  const fallbackPrefix = `${baseName} · `;
  return task.group.startsWith(fallbackPrefix) ? null : task.group;
}

/** Selects independently configured overdue and upcoming task windows. */
export function getUpcomingSummary(
  tasks: Task[],
  todayIso: string,
  options: UpcomingSummaryOptions = DEFAULT_UPCOMING_OPTIONS,
): UpcomingSummary {
  const today = parseIsoDate(todayIso);
  if (today === null) return { upcomingCount: 0, overdueCount: 0, items: [] };
  const upcomingDays = Math.max(0, Math.floor(options.upcomingDays));
  const overdueLookbackDays = Math.max(0, Math.floor(options.overdueLookbackDays));
  const end = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + upcomingDays,
    12,
  );
  const oldestOverdue = overdueLookbackDays === 0
    ? null
    : new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - overdueLookbackDays,
      12,
    );
  const todayTime = today.getTime();
  const endTime = end.getTime();
  const items: UpcomingTask[] = [];

  for (const task of tasks) {
    if (task.done) continue;
    const deadline = getRenderableTaskDate(task);
    if (deadline === null) continue;
    const date = parseIsoDate(deadline);
    if (date === null) continue;
    const deadlineTime = date.getTime();
    const overdue = deadlineTime < todayTime;
    if (overdue) {
      if (!options.showOverdue) continue;
      if (oldestOverdue !== null && deadlineTime < oldestOverdue.getTime()) continue;
    } else if (deadlineTime > endTime) {
      continue;
    }
    items.push({ task, deadline: formatIsoDate(date), overdue });
  }

  items.sort((left, right) => (
    left.deadline.localeCompare(right.deadline)
    || left.task.filePath.localeCompare(right.task.filePath)
    || left.task.line - right.task.line
  ));

  return {
    upcomingCount: items.filter((item) => !item.overdue).length,
    overdueCount: items.filter((item) => item.overdue).length,
    items,
  };
}

/** Returns whole calendar days between two valid ISO dates. */
export function calendarDaysBetween(fromIso: string, toIso: string): number | null {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  if (from === null || to === null) return null;
  const fromUtc = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const toUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((toUtc - fromUtc) / DAY_MS);
}
