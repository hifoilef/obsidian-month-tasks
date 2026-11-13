import type { Task } from './parser';

const CHECKBOX = /^(\s*[-*]\s+\[)[ xX](\])/u;

export type CompletionUpdateFailure = 'source-changed' | 'invalid-task-line';

export interface CompletionUpdateResult {
  content: string;
  updated: boolean;
  failure?: CompletionUpdateFailure;
}

/** Changes only the checkbox character on one Markdown task line. */
export function setTaskLineCompletion(rawLine: string, done: boolean): string | null {
  if (!CHECKBOX.test(rawLine)) return null;
  return rawLine.replace(CHECKBOX, `$1${done ? 'x' : ' '}$2`);
}

/** Verifies the scanned source line before changing it in full file content. */
export function updateTaskCompletionInContent(
  content: string,
  task: Pick<Task, 'line' | 'rawLine'>,
  done: boolean,
): CompletionUpdateResult {
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/u);
  if (lines[task.line] !== task.rawLine) {
    return { content, updated: false, failure: 'source-changed' };
  }
  const updatedLine = setTaskLineCompletion(task.rawLine, done);
  if (updatedLine === null) {
    return { content, updated: false, failure: 'invalid-task-line' };
  }
  lines[task.line] = updatedLine;
  return { content: lines.join(newline), updated: true };
}
