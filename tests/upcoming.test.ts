import { describe, expect, it } from 'vitest';
import type { Task } from '../src/parser';
import { getUpcomingGroupLabel, getUpcomingSummary } from '../src/calendar/upcoming';

function task(title: string, due?: string, overrides: Partial<Task> = {}): Task {
  const rawLine = `- [ ] ${title}${due === undefined ? '' : ` 📅 ${due}`}`;
  return {
    id: `Tasks.md:${title}`,
    filePath: 'Tasks.md',
    line: 0,
    rawLine,
    title,
    titleOccurrence: 0,
    done: false,
    ...(due === undefined ? {} : { due }),
    tags: [],
    group: 'Tasks',
    source: 'markdown',
    ...overrides,
  };
}

describe('upcoming summary', () => {
  it('counts overdue and today-through-day-seven separately', () => {
    const tasks = [
      task('overdue', '2026-10-14'),
      task('today', '2026-10-15'),
      task('day seven', '2026-10-22'),
      task('day eight', '2026-10-23'),
      task('completed', '2026-10-16', { done: true }),
      task('undated'),
      task('start only', undefined, { start: '2026-10-18' }),
    ];

    const result = getUpcomingSummary(tasks, '2026-10-15');
    expect(result.overdueCount).toBe(1);
    expect(result.upcomingCount).toBe(3);
    expect(result.items.map((item) => item.task.title)).toEqual([
      'overdue', 'today', 'start only', 'day seven',
    ]);
  });

  it('sorts overdue first and then by the nearest deadline', () => {
    const tasks = [
      task('later', '2026-10-20'),
      task('old overdue', '2026-10-10'),
      task('near overdue', '2026-10-14'),
      task('today', '2026-10-15'),
    ];

    expect(getUpcomingSummary(tasks, '2026-10-15').items.map((item) => item.task.title))
      .toEqual(['old overdue', 'near overdue', 'today', 'later']);
  });

  it('configures the upcoming and overdue windows independently', () => {
    const tasks = [
      task('four days overdue', '2026-10-11'),
      task('three days overdue', '2026-10-12'),
      task('today', '2026-10-15'),
      task('day three', '2026-10-18'),
      task('day four', '2026-10-19'),
    ];

    const limited = getUpcomingSummary(tasks, '2026-10-15', {
      upcomingDays: 3,
      showOverdue: true,
      overdueLookbackDays: 3,
    });
    expect(limited.items.map((item) => item.task.title)).toEqual([
      'three days overdue', 'today', 'day three',
    ]);

    const withoutOverdue = getUpcomingSummary(tasks, '2026-10-15', {
      upcomingDays: 3,
      showOverdue: false,
      overdueLookbackDays: 0,
    });
    expect(withoutOverdue.overdueCount).toBe(0);
    expect(withoutOverdue.items.map((item) => item.task.title)).toEqual([
      'today', 'day three',
    ]);
  });

  it('returns an empty summary for an invalid reference date', () => {
    expect(getUpcomingSummary([task('one', '2026-10-15')], 'invalid')).toEqual({
      upcomingCount: 0,
      overdueCount: 0,
      items: [],
    });
  });

  it('shows only explicitly named Kanban headings', () => {
    expect(getUpcomingGroupLabel(task('markdown', '2026-10-15'))).toBeNull();
    expect(getUpcomingGroupLabel(task('empty Kanban heading', '2026-10-15', {
      filePath: 'sample-board.md',
      source: 'kanban',
      group: 'sample-board · 第2列',
    }))).toBeNull();
    expect(getUpcomingGroupLabel(task('named Kanban heading', '2026-10-15', {
      filePath: 'Study.md',
      source: 'kanban',
      group: '进行中',
    }))).toBe('进行中');
  });
});
