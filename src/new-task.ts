import { hasKanbanFrontmatter } from './parser';
import { formatIsoDate, parseIsoDate } from './calendar/date-utils';
import { isPathInScanFolder, normalizeVaultPath } from './scan-scope';

const EMBEDDED_DATE_MARKER = /(?:⏳|📅)\s*\d{4}-\d{2}-\d{2}|@\{\s*\d{4}-\d{2}-\d{2}\s*\}/u;

export interface NewTaskLineInput {
  title: string;
  start?: string;
  due: string;
}

export interface NewTaskDraft {
  title: string;
  start?: string;
  due: string;
}

export type NewTaskValidationResult = {
  ok: true;
  value: NewTaskLineInput;
  info?: string;
} | {
  ok: false;
  error: string;
};

export interface NewTaskNoteCandidate {
  path: string;
  content: string;
}

/** Replaces line breaks while retaining all other user-entered title text. */
export function normalizeNewTaskTitle(title: string): string {
  return title.replace(/[\r\n]+/gu, ' ').trim();
}

/** Adds whole local calendar days to a valid ISO date. */
export function addDaysToIsoDate(value: string, days: number): string | null {
  const date = parseIsoDate(value);
  if (date === null) return null;
  date.setDate(date.getDate() + days);
  return formatIsoDate(date);
}

/** Validates and normalizes a task before any note is modified. */
export function validateNewTask(input: NewTaskDraft): NewTaskValidationResult {
  const title = normalizeNewTaskTitle(input.title);
  if (title === '') return { ok: false, error: '请输入任务标题。' };
  if (EMBEDDED_DATE_MARKER.test(title)) {
    return { ok: false, error: '标题中不能包含日期标记，请删除 ⏳、📅 或 @{日期}。' };
  }
  if (parseIsoDate(input.due) === null) {
    return { ok: false, error: '请选择真实有效的截止日期。' };
  }
  if (input.start === undefined) return { ok: true, value: { title, due: input.due } };
  if (parseIsoDate(input.start) === null) {
    return { ok: false, error: '请选择真实有效的开始日期。' };
  }
  if (input.start > input.due) {
    return { ok: false, error: '开始日期不能晚于结束日期。' };
  }
  if (input.start === input.due) {
    return {
      ok: true,
      value: { title, due: input.due },
      info: '开始与结束同一天，将按单日任务保存。',
    };
  }
  return { ok: true, value: { title, start: input.start, due: input.due } };
}

/** Builds one parser-compatible Markdown checkbox task line. */
export function buildTaskLine(input: NewTaskLineInput): string {
  return input.start === undefined
    ? `- [ ] ${input.title} 📅 ${input.due}`
    : `- [ ] ${input.title} ⏳ ${input.start} 📅 ${input.due}`;
}

/** Appends exactly one task line and leaves the resulting note newline-terminated. */
export function appendTaskToContent(content: string, line: string): string {
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  if (content.trim() === '') return `${line}${newline}`;
  return content.endsWith('\n')
    ? `${content}${line}${newline}`
    : `${content}${newline}${line}${newline}`;
}

/** Validates a configured target path before inspecting any existing file content. */
export function validateNewTaskTargetPath(path: string, scanFolder: string): string | null {
  const normalizedPath = normalizeVaultPath(path);
  if (normalizedPath === '') return '请设置新任务默认笔记。';
  if (!normalizedPath.toLocaleLowerCase().endsWith('.md')) {
    return '新任务默认笔记必须是以 .md 结尾的 Markdown 文件。';
  }
  if (!isPathInScanFolder(normalizedPath, scanFolder)) {
    return '新任务默认笔记不在当前扫描文件夹范围内。';
  }
  return null;
}

/** Keeps only ordinary Markdown notes inside the active scan scope. */
export function filterNewTaskNoteCandidates(
  candidates: NewTaskNoteCandidate[],
  scanFolder: string,
): NewTaskNoteCandidate[] {
  return candidates.filter((candidate) => (
    candidate.path.toLocaleLowerCase().endsWith('.md')
    && isPathInScanFolder(candidate.path, scanFolder)
    && !hasKanbanFrontmatter(candidate.content.split(/\r?\n/u))
  ));
}
