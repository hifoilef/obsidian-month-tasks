import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Task } from '../src/parser';
import { parseFile } from '../src/parser';
import { groupPendingTasks } from '../src/calendar/pending';

function task(
  title: string,
  filePath: string,
  line: number,
  overrides: Partial<Task> = {},
): Task {
  return {
    id: `${filePath}:${line}`,
    filePath,
    line,
    rawLine: `- [ ] ${title}`,
    title,
    titleOccurrence: 0,
    done: false,
    tags: [],
    group: 'ignored Kanban column',
    source: 'markdown',
    ...overrides,
  };
}

describe('groupPendingTasks', () => {
  it('excludes dated and completed tasks while preserving duplicate undated tasks', () => {
    const tasks = [
      task('same', 'Tasks.md', 5, { titleOccurrence: 1 }),
      task('due', 'Tasks.md', 2, { due: '2026-10-20' }),
      task('start', 'Tasks.md', 3, { start: '2026-10-18' }),
      task('done', 'Tasks.md', 4, { done: true }),
      task('same', 'Tasks.md', 1),
    ];

    const [group] = groupPendingTasks(tasks, 'Other.md');
    expect(group?.tasks.map((item) => [item.title, item.line])).toEqual([
      ['same', 1],
      ['same', 5],
    ]);
  });

  it('puts the default note first and sorts remaining groups by note name', () => {
    const groups = groupPendingTasks([
      task('z', 'Zeta.md', 0),
      task('a', 'Alpha.md', 0),
      task('default', 'Month Tasks/任务收集.md', 0),
    ], 'Month Tasks/任务收集.md');

    expect(groups.map((group) => group.filePath)).toEqual([
      'Month Tasks/任务收集.md',
      'Alpha.md',
      'Zeta.md',
    ]);
  });

  it('disambiguates same-named notes with their parent folders', () => {
    const groups = groupPendingTasks([
      task('one', 'Work/Tasks.md', 0),
      task('two', 'Study/Tasks.md', 0),
    ], 'none.md');

    expect(groups.map((group) => group.label)).toEqual([
      'Tasks（Study）',
      'Tasks（Work）',
    ]);
  });

  it('groups Kanban tasks only by note name and ignores column labels', () => {
    const groups = groupPendingTasks([
      task('one', 'Boards/sample-board.md', 3, {
        source: 'kanban',
        group: 'sample-board · 第2列',
      }),
      task('two', 'Boards/sample-board.md', 8, {
        source: 'kanban',
        group: '复习中',
      }),
    ], 'none.md');

    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe('sample-board');
    expect(groups[0]?.tasks.map((item) => item.title)).toEqual(['one', 'two']);
  });

  it('returns an empty array when there are no pending tasks', () => {
    expect(groupPendingTasks([], 'Tasks.md')).toEqual([]);
    expect(groupPendingTasks([
      task('done', 'Tasks.md', 0, { done: true }),
      task('dated', 'Tasks.md', 1, { due: '2026-10-20' }),
    ], 'Tasks.md')).toEqual([]);
  });

  it('finds 23 pending tasks in the sample fixture under one note group', () => {
    const content = readFileSync(
      new URL('./fixtures/sample-board.md', import.meta.url),
      'utf8',
    );
    const groups = groupPendingTasks(parseFile('sample-board.md', content), 'Tasks.md');

    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe('sample-board');
    expect(groups[0]?.tasks).toHaveLength(23);
  });
});
