import { describe, expect, it } from 'vitest';
import { parseFile } from '../src/parser';
import {
  addDaysToIsoDate,
  appendTaskToContent,
  buildTaskLine,
  filterNewTaskNoteCandidates,
  validateNewTask,
  validateNewTaskTargetPath,
} from '../src/new-task';

describe('new task validation', () => {
  it('uses real calendar arithmetic for the default range end', () => {
    expect(addDaysToIsoDate('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysToIsoDate('invalid', 1)).toBeNull();
  });
  it('normalizes line breaks and accepts a valid single-day task', () => {
    expect(validateNewTask({
      title: '  中文\n任务  ',
      due: '2026-10-20',
    })).toEqual({
      ok: true,
      value: { title: '中文 任务', due: '2026-10-20' },
    });
  });

  it('rejects empty titles and embedded date markers', () => {
    expect(validateNewTask({ title: ' \n ', due: '2026-10-20' })).toEqual({
      ok: false,
      error: '请输入任务标题。',
    });
    for (const title of [
      '重复 📅 2026-10-21',
      '重复 ⏳2026-10-20',
      '重复 @{2026-10-20}',
    ]) {
      expect(validateNewTask({ title, due: '2026-10-20' }).ok).toBe(false);
    }
  });

  it('rejects invalid and reversed dates', () => {
    expect(validateNewTask({ title: '任务', due: '2026-02-30' }).ok).toBe(false);
    expect(validateNewTask({
      title: '任务',
      start: '2026-10-25',
      due: '2026-10-20',
    })).toEqual({ ok: false, error: '开始日期不能晚于结束日期。' });
  });

  it('collapses an equal range into one due date with an inline message', () => {
    expect(validateNewTask({
      title: '同一天',
      start: '2026-10-20',
      due: '2026-10-20',
    })).toEqual({
      ok: true,
      value: { title: '同一天', due: '2026-10-20' },
      info: '开始与结束同一天，将按单日任务保存。',
    });
  });
});

describe('new task Markdown output', () => {
  it('builds and parses a single-day Chinese task with a tag', () => {
    const line = buildTaskLine({ title: '复习中文 #考试', due: '2026-10-20' });
    expect(line).toBe('- [ ] 复习中文 #考试 📅 2026-10-20');
    const parsed = parseFile('任务收集.md', line)[0];
    expect(parsed).toMatchObject({
      title: '复习中文',
      due: '2026-10-20',
      done: false,
      tags: ['考试'],
    });
  });

  it('builds and parses a multi-day task', () => {
    const line = buildTaskLine({
      title: '完成论文',
      start: '2026-10-20',
      due: '2026-10-25',
    });
    expect(parseFile('任务收集.md', line)[0]).toMatchObject({
      title: '完成论文',
      start: '2026-10-20',
      due: '2026-10-25',
      done: false,
    });
  });

  it('appends cleanly for every file ending shape', () => {
    const line = '- [ ] 新任务 📅 2026-10-20';
    expect(appendTaskToContent('', line)).toBe(`${line}\n`);
    expect(appendTaskToContent('\n', line)).toBe(`${line}\n`);
    expect(appendTaskToContent('现有内容', line)).toBe(`现有内容\n${line}\n`);
    expect(appendTaskToContent('现有内容\n', line)).toBe(`现有内容\n${line}\n`);
    expect(appendTaskToContent('现有内容\r\n', line)).toBe(`现有内容\r\n${line}\r\n`);
  });
});

describe('new task note targets', () => {
  it('rejects non-Markdown and out-of-scope default paths', () => {
    expect(validateNewTaskTargetPath('Tasks/new.txt', 'Tasks')).toContain('.md');
    expect(validateNewTaskTargetPath('Elsewhere/new.md', 'Tasks')).toContain('扫描文件夹');
    expect(validateNewTaskTargetPath('Tasks/new.md', 'Tasks')).toBeNull();
  });

  it('filters Kanban and out-of-scope notes from picker candidates', () => {
    const candidates = filterNewTaskNoteCandidates([
      { path: 'Tasks/普通.md', content: '- [ ] task' },
      { path: 'Tasks/看板.md', content: '---\nkanban-plugin: board\n---\n' },
      { path: 'Elsewhere/其他.md', content: '' },
      { path: 'Tasks/not.txt', content: '' },
    ], 'Tasks');
    expect(candidates.map((candidate) => candidate.path)).toEqual(['Tasks/普通.md']);
  });
});
