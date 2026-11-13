import { describe, expect, it } from 'vitest';
import { layoutDayRows } from '../src/calendar/layout-day-rows';
import type { WeekBarSegment } from '../src/calendar/layout-week-bars';
import type { Task } from '../src/parser';

function task(title: string): Task {
  return {
    id: `${title}:0`,
    filePath: 'test.md',
    line: 0,
    rawLine: `- [ ] ${title}`,
    title,
    titleOccurrence: 0,
    done: false,
    tags: [],
    group: 'test',
    source: 'markdown',
  };
}

function bar(title: string, lane: number): WeekBarSegment {
  return {
    task: task(title),
    weekIndex: 0,
    weekStart: '2026-06-15',
    startCol: 0,
    endCol: 0,
    lane,
    continuesLeft: false,
    continuesRight: false,
  };
}

describe('layoutDayRows', () => {
  it('uses rows that are free on this date instead of reserving the whole week', () => {
    const result = layoutDayRows(
      [bar('复习周', 1)],
      [task('课程A'), task('第二项'), task('第三项')],
      3,
    );
    expect(result.visibleSingleTasks.map(({ task: item, row }) => [item.title, row]))
      .toEqual([['课程A', 0], ['第二项', 2]]);
    expect(result.hiddenCount).toBe(1);
  });

  it('keeps the fourth item behind the more button when all rows are occupied', () => {
    const result = layoutDayRows(
      [bar('期末论文', 0), bar('复习周', 1), bar('项目冲刺', 2)],
      [task('python')],
      3,
    );
    expect(result.visibleSingleTasks).toEqual([]);
    expect(result.hiddenCount).toBe(1);
  });
});
