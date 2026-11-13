import type { Task } from '../parser';
import type { MonthTasksSettings } from '../settings';
import { getStoredTaskColor, normalizeHexColor } from '../task-color';

export const FALLBACK_TASK_COLOR = '#6b7280';

/** Keeps persisted and user-entered colors in a CSS-safe hex format. */
export function normalizeTaskColor(value: string): string {
  return normalizeHexColor(value) ?? FALLBACK_TASK_COLOR;
}

/** Uses a safely matched stored color before the user-selected default. */
export function getTaskColor(
  task: Pick<Task, 'filePath' | 'rawLine' | 'title' | 'titleOccurrence'>,
  settings: Pick<MonthTasksSettings, 'defaultTaskColor' | 'taskColors'>,
): string {
  return normalizeTaskColor(
    getStoredTaskColor(task, settings.taskColors) ?? settings.defaultTaskColor,
  );
}
