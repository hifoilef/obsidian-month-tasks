import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getRenderableTaskDate } from '../src/calendar/date-utils';
import {
  layoutWeekBars,
  type WeekBarSegment,
} from '../src/calendar/layout-week-bars';
import { parseFile, type Task } from '../src/parser';

const content = readFileSync(
  new URL('./fixtures/multiday.md', import.meta.url),
  'utf8',
);
const tasks = parseFile('multiday.md', content);
const juneStart = '2026-06-01';
const juneEnd = '2026-07-05';

function segmentsFor(title: string): WeekBarSegment[] {
  return layoutWeekBars(tasks, juneStart, juneEnd)
    .filter((segment) => segment.task.title === title);
}

function syntheticTask(title: string, start: string, due: string): Task {
  return {
    id: `${title}:0`,
    filePath: 'synthetic.md',
    line: 0,
    rawLine: '',
    title,
    titleOccurrence: 0,
    done: false,
    start,
    due,
    tags: [],
    group: 'synthetic',
    source: 'markdown',
  };
}

describe('layoutWeekBars', () => {
  it('lays out a task contained within one week', () => {
    const [segment] = layoutWeekBars(
      [syntheticTask('单周任务', '2026-06-02', '2026-06-04')],
      juneStart,
      juneEnd,
    );

    expect(segment).toMatchObject({
      weekIndex: 0,
      startCol: 1,
      endCol: 3,
      lane: 0,
      continuesLeft: false,
      continuesRight: false,
    });
  });

  it('splits 期末论文 across two weeks with continuation flags', () => {
    expect(segmentsFor('期末论文')).toMatchObject([
      {
        weekIndex: 1,
        startCol: 2,
        endCol: 6,
        continuesLeft: false,
        continuesRight: true,
      },
      {
        weekIndex: 2,
        startCol: 0,
        endCol: 1,
        continuesLeft: true,
        continuesRight: false,
      },
    ]);
  });

  it('splits 复习周 across three weeks', () => {
    expect(segmentsFor('复习周')).toMatchObject([
      { weekIndex: 1, startCol: 4, endCol: 6 },
      { weekIndex: 2, startCol: 0, endCol: 6 },
      { weekIndex: 3, startCol: 0, endCol: 3 },
    ]);
  });

  it('assigns overlapping segments to distinct lanes', () => {
    const segments = layoutWeekBars(tasks, juneStart, juneEnd);
    for (let leftIndex = 0; leftIndex < segments.length; leftIndex += 1) {
      const left = segments[leftIndex];
      if (left === undefined) continue;
      for (let rightIndex = leftIndex + 1; rightIndex < segments.length; rightIndex += 1) {
        const right = segments[rightIndex];
        if (right === undefined || left.weekIndex !== right.weekIndex) continue;
        const overlaps = left.startCol <= right.endCol && right.startCol <= left.endCol;
        if (overlaps) expect(left.lane).not.toBe(right.lane);
      }
    }

    const overlapWeek = segments.filter((segment) => segment.weekIndex === 1);
    expect(overlapWeek.find((segment) => segment.task.title === '期末论文')?.lane).toBe(0);
    expect(overlapWeek.find((segment) => segment.task.title === '复习周')?.lane).toBe(1);
  });

  it('clips 实习 at the visible range and marks its left continuation', () => {
    expect(segmentsFor('实习')).toMatchObject([
      {
        weekIndex: 0,
        startCol: 0,
        endCol: 2,
        continuesLeft: true,
        continuesRight: false,
      },
    ]);
  });

  it('leaves an inverted range for single-day rendering', () => {
    const inverted = tasks.find((task) => task.title === '倒置日期');
    expect(inverted).toBeDefined();
    expect(segmentsFor('倒置日期')).toEqual([]);
    expect(inverted === undefined ? null : getRenderableTaskDate(inverted)).toBe('2026-06-10');
  });
});
