import type { Task } from '../parser';

export interface PendingTaskGroup {
  /** Stable identity used for persisted collapse state. */
  key: string;
  filePath: string;
  noteName: string;
  label: string;
  tasks: Task[];
}

function splitFilePath(filePath: string): { noteName: string; folderName: string } {
  const parts = filePath.replace(/\\/gu, '/').split('/').filter(Boolean);
  const fileName = parts.at(-1) ?? filePath;
  const lastDot = fileName.lastIndexOf('.');
  const noteName = lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
  return {
    noteName,
    folderName: parts.length > 1 ? (parts.at(-2) ?? '根目录') : '根目录',
  };
}

function normalizePath(path: string): string {
  return path.trim().replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '');
}

/** Groups incomplete undated tasks by source note, independently from Kanban columns. */
export function groupPendingTasks(
  tasks: Task[],
  defaultNotePath: string,
): PendingTaskGroup[] {
  const tasksByFile = new Map<string, Task[]>();
  for (const task of tasks) {
    if (task.done || task.start !== undefined || task.due !== undefined) continue;
    const fileTasks = tasksByFile.get(task.filePath) ?? [];
    fileTasks.push(task);
    tasksByFile.set(task.filePath, fileTasks);
  }

  if (tasksByFile.size === 0) return [];

  const duplicateCounts = new Map<string, number>();
  for (const filePath of tasksByFile.keys()) {
    const { noteName } = splitFilePath(filePath);
    duplicateCounts.set(noteName, (duplicateCounts.get(noteName) ?? 0) + 1);
  }

  const groups = Array.from(tasksByFile, ([filePath, fileTasks]) => {
    const { noteName, folderName } = splitFilePath(filePath);
    const duplicateName = (duplicateCounts.get(noteName) ?? 0) > 1;
    return {
      key: normalizePath(filePath),
      filePath,
      noteName,
      label: duplicateName ? `${noteName}（${folderName}）` : noteName,
      tasks: [...fileTasks].sort((left, right) => left.line - right.line),
    } satisfies PendingTaskGroup;
  });

  const normalizedDefault = normalizePath(defaultNotePath);
  groups.sort((left, right) => {
    const leftDefault = left.key === normalizedDefault;
    const rightDefault = right.key === normalizedDefault;
    if (leftDefault !== rightDefault) return leftDefault ? -1 : 1;
    return left.noteName.localeCompare(right.noteName, 'zh-CN')
      || left.filePath.localeCompare(right.filePath, 'zh-CN');
  });
  return groups;
}
