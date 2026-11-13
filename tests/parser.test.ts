import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseFile } from '../src/parser';

describe('parseFile', () => {
  it('parses single-day, multi-day, unscheduled, Kanban-date, and completed tasks', () => {
    const content = [
      '- [ ] Single 📅 2026-06-16',
      '- [ ] Range ⏳ 2026-06-10 📅 2026-06-16',
      '- [ ] Unscheduled',
      '- [ ] Kanban date @{2026-06-12}',
      '- [X] Finished ✅ 2026-06-11',
    ].join('\n');

    const tasks = parseFile('Tasks/demo.md', content);

    expect(tasks).toHaveLength(5);
    expect(tasks[0]).toMatchObject({ title: 'Single', due: '2026-06-16' });
    expect(tasks[1]).toMatchObject({
      title: 'Range',
      start: '2026-06-10',
      due: '2026-06-16',
    });
    expect(tasks[2]).toMatchObject({ title: 'Unscheduled' });
    expect(tasks[2]).not.toHaveProperty('start');
    expect(tasks[2]).not.toHaveProperty('due');
    expect(tasks[3]).toMatchObject({ title: 'Kanban date', due: '2026-06-12' });
    expect(tasks[4]).toMatchObject({ title: 'Finished', done: true });
  });

  it('extracts Chinese, slash, and hyphen tags and removes them from the title', () => {
    const [task] = parseFile(
      '学习计划.md',
      '- [ ] 复习线性代数 #学习/数学 #高-优先级 📅 2026-06-16',
    );

    expect(task).toMatchObject({
      title: '复习线性代数',
      tags: ['学习/数学', '高-优先级'],
      group: '学习计划',
      source: 'markdown',
    });
  });

  it.each([
    {
      name: '普通 Markdown',
      filePath: 'Tasks.md',
      content: '- [x] 彩色任务 #复习 ⏳ 2026-06-10 📅 2026-06-16 %%mt-color:#8B5CF6%%',
      source: 'markdown',
      group: 'Tasks',
    },
    {
      name: 'Kanban',
      filePath: 'Board.md',
      content: [
        '---',
        'kanban-plugin: board',
        '---',
        '## 进行中',
        '- [x] 彩色任务 #复习 ⏳ 2026-06-10 📅 2026-06-16 %%mt-color:#8B5CF6%%',
      ].join('\n'),
      source: 'kanban',
      group: '进行中',
    },
  ])('parses a task with a legacy inline color marker in $name', ({
    filePath, content, source, group,
  }) => {
    const [task] = parseFile(filePath, content);
    expect(task).toMatchObject({
      title: '彩色任务',
      start: '2026-06-10',
      due: '2026-06-16',
      done: true,
      tags: ['复习'],
      source,
      group,
    });
  });

  it('uses Kanban columns as groups and ignores Archive and everything after it', () => {
    const content = [
      '---',
      'kanban-plugin: board',
      '---',
      '## Todo',
      '- [ ] First 📅 2026-06-01',
      '## Doing',
      '- [ ] Second ⏳ 2026-06-02',
      '## Archive',
      '- [x] Archived 📅 2026-05-01',
      '## Later',
      '- [ ] Also ignored 📅 2026-07-01',
    ].join('\n');

    const tasks = parseFile('Boards/work.md', content);

    expect(tasks.map((task) => [task.title, task.group])).toEqual([
      ['First', 'Todo'],
      ['Second', 'Doing'],
    ]);
    expect(tasks.every((task) => task.source === 'kanban')).toBe(true);
  });

  it('ignores fenced-code tasks and comment-block tasks', () => {
    const content = [
      '```md',
      '- [ ] Fake 📅 2026-06-01',
      '```',
      '%%',
      '- [ ] Hidden 📅 2026-06-02',
      '%%',
      '- [ ] Real 📅 2026-06-03',
    ].join('\n');

    expect(parseFile('notes.md', content).map((task) => task.title)).toEqual(['Real']);
  });

  it('adds a warning when start is later than due', () => {
    const [task] = parseFile(
      'bad-range.md',
      '- [ ] Reversed ⏳ 2026-06-20 📅 2026-06-10',
    );

    expect(task?.warning).toBe('开始日期晚于截止日期');
  });

  it('keeps zero-based line numbers, raw lines, ids, and lowercase x completion', () => {
    const rawLine = '* [x] Ship #release 📅 2026-06-10';
    const [task] = parseFile('Roadmap.md', `Intro\n${rawLine}`);

    expect(task).toMatchObject({
      id: 'Roadmap.md:1',
      filePath: 'Roadmap.md',
      line: 1,
      rawLine,
      titleOccurrence: 0,
      done: true,
    });
  });

  it('numbers duplicate titles independently within one file', () => {
    const tasks = parseFile('duplicates.md', [
      '- [ ] 同名任务 📅 2026-06-01',
      '- [ ] 其他任务',
      '- [ ] 同名任务 📅 2026-06-02',
    ].join('\n'));

    expect(tasks.map((item) => [item.title, item.titleOccurrence])).toEqual([
      ['同名任务', 0],
      ['其他任务', 0],
      ['同名任务', 1],
    ]);
  });

  it('uses numbered fallback groups for empty Kanban columns', () => {
    const content = [
      '---',
      'kanban-plugin: board',
      '---',
      '## ',
      '- [ ] First',
      '## Named',
      '- [ ] Second',
      '## ',
      '- [ ] Third',
    ].join('\n');

    expect(parseFile('board.md', content).map((task) => task.group)).toEqual([
      'board · 第1列',
      'Named',
      'board · 第3列',
    ]);
  });

  it('filters tasks whose cleaned titles contain only punctuation or whitespace', () => {
    const content = [
      '- [ ] ————',
      '- [ ] --- #separator',
      '- [ ] ... 📅 2026-06-12',
      '- [ ] Real task',
    ].join('\n');

    expect(parseFile('notes.md', content).map((task) => task.title)).toEqual([
      'Real task',
    ]);
  });

  it('matches the sample Kanban fixture', () => {
    const content = readFileSync(
      new URL('./fixtures/sample-board.md', import.meta.url),
      'utf8',
    );
    const tasks = parseFile('sample-board.md', content);
    const datedTasks = tasks.filter(
      (task) => task.start !== undefined || task.due !== undefined,
    );
    const dates = datedTasks
      .map((task) => task.due ?? task.start)
      .filter((date): date is string => date !== undefined)
      .sort();
    const separatorLine = content.split(/\r?\n/u).findIndex((line) => line.trim() === '***');

    expect(tasks).toHaveLength(38);
    expect(datedTasks).toHaveLength(9);
    expect(dates).toEqual([
      '2026-06-12',
      '2026-06-15',
      '2026-06-17',
      '2026-06-18',
      '2026-06-21',
      '2026-06-22',
      '2026-06-23',
      '2026-06-24',
      '2026-06-25',
    ]);
    expect(tasks.filter((task) => task.done)).toHaveLength(6);
    expect(
      tasks.filter(
        (task) => !task.done && task.start === undefined && task.due === undefined,
      ),
    ).toHaveLength(23);
    expect(tasks.every((task) => task.line < separatorLine)).toBe(true);
    expect([...new Set(tasks.map((task) => task.group))]).toEqual([
      'sample-board · 第1列',
      'sample-board · 第2列',
      'sample-board · 第3列',
      'sample-board · 第4列',
    ]);
  });
});
