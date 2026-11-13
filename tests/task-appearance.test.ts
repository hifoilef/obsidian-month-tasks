import { describe, expect, it } from 'vitest';
import {
  FALLBACK_TASK_COLOR,
  getTaskColor,
  normalizeTaskColor,
} from '../src/calendar/task-appearance';
import {
  DEFAULT_TASK_COLOR_PALETTE,
  TASK_COLOR_ORPHAN_RETENTION_MS,
  getStoredTaskColor,
  getTaskColorPalette,
  normalizeHexColor,
  normalizeRecentTaskColors,
  normalizeRememberedTaskColors,
  normalizeStoredTaskColors,
  reconcileStoredTaskColors,
  renameStoredTaskColorPath,
  rememberRecentTaskColor,
  removeLegacyTaskColorMarker,
  stripInlineComments,
  updateStoredTaskColor,
} from '../src/task-color';
import type { Task } from '../src/parser';

function task(
  rawLine = '- [ ] 期末论文 📅 2026-06-16',
  overrides: Partial<Task> = {},
): Task {
  return {
    id: 'Tasks.md:0',
    filePath: 'Tasks.md',
    line: 0,
    rawLine,
    title: '期末论文',
    titleOccurrence: 0,
    done: rawLine.includes('[x]'),
    due: '2026-06-16',
    tags: [],
    group: 'Tasks',
    source: 'markdown',
    ...overrides,
  };
}

describe('task appearance', () => {
  it('normalizes safe colors and falls back from invalid values', () => {
    expect(normalizeTaskColor(' #AABBCC ')).toBe('#aabbcc');
    expect(normalizeTaskColor('red')).toBe(FALLBACK_TASK_COLOR);
    expect(normalizeTaskColor('#123')).toBe(FALLBACK_TASK_COLOR);
  });

  it('uses an individual task color before the configured default', () => {
    const current = task();
    const taskColors = updateStoredTaskColor({}, current, '#0000ff');
    const settings = { defaultTaskColor: '#777777', taskColors };
    expect(getTaskColor(current, settings)).toBe('#0000ff');
    expect(getTaskColor({ ...current, rawLine: `${current.rawLine} changed` }, settings))
      .toBe('#0000ff');
    const movedTask = { ...current, id: 'Tasks.md:99', line: 99 };
    expect(getTaskColor(movedTask, settings)).toBe('#0000ff');
  });

  it('strips an abandoned inline color marker from parsing and cleanup', () => {
    const body = '期末论文 📅 2026-06-16 %%mt-color:#AABBCC%%';
    expect(stripInlineComments(body)).toBe('期末论文 📅 2026-06-16  ');
    expect(removeLegacyTaskColorMarker(`- [ ] ${body}`)).toBe(
      '- [ ] 期末论文 📅 2026-06-16',
    );
    expect(normalizeHexColor('blue')).toBeNull();
  });

  it('stores colors outside notes and keeps them across checkbox changes', () => {
    const openTask = task();
    const colors = updateStoredTaskColor({}, openTask, '#8B5CF6');
    expect(getStoredTaskColor(openTask, colors)).toBe('#8b5cf6');
    expect(getStoredTaskColor(task('- [x] 期末论文 📅 2026-06-16'), colors))
      .toBe('#8b5cf6');
    expect(updateStoredTaskColor(colors, openTask, null)).toEqual({});
    expect(normalizeStoredTaskColors({ bad: { color: 'red', fingerprint: 'x' } }))
      .toEqual({});
  });

  it('keeps colors after line insertion and separates duplicate titles', () => {
    const first = task();
    const second = task('- [ ] 期末论文 📅 2026-06-20', {
      id: 'Tasks.md:1',
      line: 1,
      titleOccurrence: 1,
      due: '2026-06-20',
    });
    let colors = updateStoredTaskColor({}, first, '#111111');
    colors = updateStoredTaskColor(colors, second, '#222222');

    const movedFirst = { ...first, id: 'Tasks.md:8', line: 8 };
    expect(getStoredTaskColor(movedFirst, colors)).toBe('#111111');
    expect(getStoredTaskColor(second, colors)).toBe('#222222');
  });

  it('moves color keys with a note and preserves them after persisted data is reloaded', () => {
    const original = task();
    const colors = updateStoredTaskColor({}, original, '#123456');
    const renamedColors = renameStoredTaskColorPath(colors, 'Tasks.md', 'Archive/Tasks.md');
    const renamedTask = { ...original, filePath: 'Archive/Tasks.md' };
    const reloadedColors = normalizeStoredTaskColors(renamedColors);

    expect(getStoredTaskColor(original, renamedColors)).toBeUndefined();
    expect(getStoredTaskColor(renamedTask, reloadedColors)).toBe('#123456');
  });

  it('marks deleted tasks as orphaned before pruning them after 14 days', () => {
    const kept = task();
    const deleted = task('- [ ] 第二项', {
      id: 'Tasks.md:1',
      line: 1,
      title: '第二项',
      titleOccurrence: 0,
    });
    let colors = updateStoredTaskColor({}, kept, '#111111');
    colors = updateStoredTaskColor(colors, deleted, '#222222');
    const scan = {
      scanCompleted: true,
      hadReadFailures: false,
      scanScopeChanged: false,
      scanFolder: '',
      successfulFilePaths: ['Tasks.md'],
      existingFilePaths: ['Tasks.md'],
      now: 1_000,
    };
    const orphaned = reconcileStoredTaskColors(colors, [kept], scan);
    const reconciled = reconcileStoredTaskColors(orphaned, [kept], {
      ...scan,
      now: 1_000 + TASK_COLOR_ORPHAN_RETENTION_MS,
    });

    expect(getStoredTaskColor(deleted, orphaned)).toBe('#222222');
    expect(getStoredTaskColor(kept, reconciled)).toBe('#111111');
    expect(getStoredTaskColor(deleted, reconciled)).toBeUndefined();
    expect(getStoredTaskColor({ ...kept, title: '新标题' }, reconciled)).toBeUndefined();
  });

  it('keeps eight unique recent colors with the newest first', () => {
    const recent = normalizeRecentTaskColors([
      '#111111', '#222222', 'invalid', '#111111', '#333333', '#444444',
      '#555555', '#666666', '#777777', '#888888', '#999999',
    ]);
    expect(recent).toEqual([
      '#111111', '#222222', '#333333', '#444444',
      '#555555', '#666666', '#777777', '#888888',
    ]);
    expect(rememberRecentTaskColor(recent, '#333333')).toEqual([
      '#333333', '#111111', '#222222', '#444444',
      '#555555', '#666666', '#777777', '#888888',
    ]);
  });

  it('shows eight useful palette colors before any color has been saved', () => {
    const initial = getTaskColorPalette([]);
    expect(initial).toEqual([...DEFAULT_TASK_COLOR_PALETTE]);
    expect(new Set(initial).size).toBe(8);
    expect(getTaskColorPalette(['#123456'])).toEqual([
      '#123456',
      ...initial.filter((color) => color !== '#123456').slice(0, 7),
    ]);
    expect(normalizeRememberedTaskColors([
      '#e5484d', '#e08d2d', '#d6a521', '#30a46c',
      '#12a594', '#3e63dd', '#8e4ec6', '#d6409f',
    ])).toEqual([]);
  });

});
