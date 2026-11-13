import { describe, expect, it } from 'vitest';
import { setTaskLineCompletion, updateTaskCompletionInContent } from '../src/task-completion';

describe('task completion write-back', () => {
  it('toggles a checkbox and preserves every other character', () => {
    const rawLine = '- [ ] 写论文 📅 2026-06-23 %%mt-color:#4d8057%% #exam';
    const completed = setTaskLineCompletion(rawLine, true);
    expect(completed).toBe('- [x] 写论文 📅 2026-06-23 %%mt-color:#4d8057%% #exam');
    expect(setTaskLineCompletion(completed ?? '', false)).toBe(rawLine);
  });

  it('updates only the scanned line in the full note', () => {
    const rawLine = '- [ ] target 📅 2026-10-16';
    const content = ['# Tasks', rawLine, '- [ ] untouched'].join('\n');
    const result = updateTaskCompletionInContent(content, { line: 1, rawLine }, true);

    expect(result).toEqual({
      content: ['# Tasks', '- [x] target 📅 2026-10-16', '- [ ] untouched'].join('\n'),
      updated: true,
    });
  });

  it('refuses to write after the original line changed externally', () => {
    const rawLine = '- [ ] original 📅 2026-10-16';
    const content = '- [ ] changed elsewhere 📅 2026-10-16';
    expect(updateTaskCompletionInContent(content, { line: 0, rawLine }, true)).toEqual({
      content,
      updated: false,
      failure: 'source-changed',
    });
  });

  it('rejects a scanned line that is no longer a Markdown task', () => {
    const rawLine = 'plain text';
    expect(updateTaskCompletionInContent(rawLine, { line: 0, rawLine }, true)).toEqual({
      content: rawLine,
      updated: false,
      failure: 'invalid-task-line',
    });
  });
});
