import { describe, expect, it } from 'vitest';
import type { Task } from '../src/parser';
import {
  TASK_COLOR_ORPHAN_RETENTION_MS,
  getStoredTaskColor,
  normalizeStoredTaskColors,
  reconcileStoredTaskColors,
  renameStoredTaskColorPath,
  taskColorStorageKey,
  updateStoredTaskColor,
} from '../src/task-color';

function task(filePath = 'Tasks.md', title = '任务'): Task {
  return {
    id: `${filePath}:0`,
    filePath,
    line: 0,
    rawLine: `- [ ] ${title}`,
    title,
    titleOccurrence: 0,
    done: false,
    tags: [],
    group: 'Tasks',
    source: 'markdown',
  };
}

function context(overrides: Record<string, unknown> = {}) {
  return {
    scanCompleted: true,
    hadReadFailures: false,
    scanScopeChanged: false,
    scanFolder: '',
    successfulFilePaths: ['Tasks.md'],
    existingFilePaths: ['Tasks.md'],
    now: 10_000,
    ...overrides,
  };
}

describe('conservative task color cleanup', () => {
  it('keeps both card and marker colors through note rename, move, and reload', () => {
    const original = task('Tasks.md');
    const moved = { ...original, filePath: 'Archive/Tasks.md' };
    const cardColors = updateStoredTaskColor({}, original, '#123456');
    const markerColors = updateStoredTaskColor({}, original, '#abcdef');
    const movedCards = normalizeStoredTaskColors(
      renameStoredTaskColorPath(cardColors, 'Tasks.md', 'Archive/Tasks.md'),
    );
    const movedMarkers = normalizeStoredTaskColors(
      renameStoredTaskColorPath(markerColors, 'Tasks.md', 'Archive/Tasks.md'),
    );
    expect(getStoredTaskColor(moved, movedCards)).toBe('#123456');
    expect(getStoredTaskColor(moved, movedMarkers)).toBe('#abcdef');
  });

  it('skips cleanup before the first scan has completed', () => {
    const missing = task();
    const colors = updateStoredTaskColor({}, missing, '#123456');
    const result = reconcileStoredTaskColors(colors, [], context({ scanCompleted: false }));
    expect(result).toEqual(colors);
  });

  it('skips cleanup when any file failed to read', () => {
    const missing = task();
    const colors = updateStoredTaskColor({}, missing, '#123456');
    const result = reconcileStoredTaskColors(colors, [], context({ hadReadFailures: true }));
    expect(result).toEqual(colors);
  });

  it('skips cleanup immediately after the scan scope changes', () => {
    const missing = task();
    const colors = updateStoredTaskColor({}, missing, '#123456');
    const result = reconcileStoredTaskColors(colors, [], context({ scanScopeChanged: true }));
    expect(result).toEqual(colors);
  });

  it('does not clean records belonging to files outside the active scan scope', () => {
    const outside = task('Archive/Tasks.md');
    const colors = updateStoredTaskColor({}, outside, '#123456');
    const result = reconcileStoredTaskColors(colors, [], context({
      scanFolder: 'Current',
      successfulFilePaths: ['Current/Tasks.md'],
      existingFilePaths: ['Archive/Tasks.md', 'Current/Tasks.md'],
    }));
    expect(result).toEqual(colors);
  });

  it('marks a missing task, retains it for 14 days, then deletes it', () => {
    const missing = task();
    const colors = updateStoredTaskColor({}, missing, '#123456');
    const marked = reconcileStoredTaskColors(colors, [], context());
    const key = taskColorStorageKey(missing);
    expect(marked[key]?.orphanedAt).toBe(10_000);

    const retained = reconcileStoredTaskColors(marked, [], context({
      now: 10_000 + TASK_COLOR_ORPHAN_RETENTION_MS - 1,
    }));
    expect(getStoredTaskColor(missing, retained)).toBe('#123456');

    const removed = reconcileStoredTaskColors(marked, [], context({
      now: 10_000 + TASK_COLOR_ORPHAN_RETENTION_MS,
    }));
    expect(getStoredTaskColor(missing, removed)).toBeUndefined();
  });

  it('clears the orphan marker if the task returns during retention', () => {
    const restored = task();
    const colors = updateStoredTaskColor({}, restored, '#123456');
    const marked = reconcileStoredTaskColors(colors, [], context());
    const recovered = reconcileStoredTaskColors(marked, [restored], context({ now: 20_000 }));
    expect(getStoredTaskColor(restored, recovered)).toBe('#123456');
    expect(recovered[taskColorStorageKey(restored)]?.orphanedAt).toBeUndefined();
  });

  it('ages records when their source file has actually been deleted', () => {
    const deletedFileTask = task('Deleted.md');
    const colors = updateStoredTaskColor({}, deletedFileTask, '#123456');
    const marked = reconcileStoredTaskColors(colors, [], context({
      successfulFilePaths: ['Tasks.md'],
      existingFilePaths: ['Tasks.md'],
    }));
    expect(marked[taskColorStorageKey(deletedFileTask)]?.orphanedAt).toBe(10_000);
  });
});
