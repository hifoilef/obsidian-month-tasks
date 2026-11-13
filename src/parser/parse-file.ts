import type { Task } from './types';
import { stripInlineComments } from '../task-color';

const TASK_LINE = /^\s*[-*]\s\[( |x|X)\]\s+(.*)$/;
const START_DATE = /⏳\s*(\d{4}-\d{2}-\d{2})/u;
const DUE_DATE = /📅\s*(\d{4}-\d{2}-\d{2})/u;
const KANBAN_DUE_DATE = /@\{(\d{4}-\d{2}-\d{2})\}/u;
const DATE_MARKERS = /(?:⏳|📅|✅)\s*\d{4}-\d{2}-\d{2}|@\{\d{4}-\d{2}-\d{2}\}/gu;
const TAG = /(^|\s)#([\p{L}\p{N}_/-]+)/gu;
const HEADING_TWO = /^\s*##(?!#)[ \t]*(.*?)\s*$/u;
const FENCE = /^\s*(`{3,}|~{3,})/u;
const KANBAN_ARCHIVE_SEPARATOR = /^\s*\*\*\*\s*$/u;
const PUNCTUATION_ONLY = /^[\p{P}\s]*$/u;

/** Returns the file name without its final extension. */
function fileNameWithoutExtension(filePath: string): string {
  const fileName = filePath.split(/[\\/]/u).pop() ?? filePath;
  const lastDot = fileName.lastIndexOf('.');
  return lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
}

/** Detects whether the YAML frontmatter declares an Obsidian Kanban file. */
export function hasKanbanFrontmatter(lines: string[]): boolean {
  if (lines[0]?.trim() !== '---') return false;

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined || line.trim() === '---') break;
    if (/kanban-plugin/u.test(line)) return true;
  }

  return false;
}

/** Extracts tags while preserving their order of appearance. */
function extractTags(text: string): string[] {
  return Array.from(text.matchAll(TAG), (match) => match[2]).filter(
    (tag): tag is string => tag !== undefined,
  );
}

/** Removes metadata tokens and normalizes the remaining display title. */
function cleanTitle(text: string): string {
  return text
    .replace(DATE_MARKERS, ' ')
    .replace(TAG, '$1')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** Parses all supported task lines from one Markdown file. */
export function parseFile(filePath: string, content: string): Task[] {
  const lines = content.split(/\r?\n/u);
  const isKanban = hasKanbanFrontmatter(lines);
  const source: Task['source'] = isKanban ? 'kanban' : 'markdown';
  const fileGroup = fileNameWithoutExtension(filePath);
  const tasks: Task[] = [];
  const titleOccurrences = new Map<string, number>();
  let currentGroup = fileGroup;
  let columnNumber = 0;
  let fenceMarker: string | undefined;
  let inCommentBlock = false;

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    const rawLine = lines[lineNumber];
    if (rawLine === undefined) continue;

    const fenceMatch = rawLine.match(FENCE);
    if (fenceMatch?.[1] !== undefined) {
      const marker = fenceMatch[1][0];
      if (fenceMarker === undefined) fenceMarker = marker;
      else if (fenceMarker === marker) fenceMarker = undefined;
      continue;
    }
    if (fenceMarker !== undefined) continue;

    const commentDelimiters = rawLine.match(/%%/gu)?.length ?? 0;
    if (inCommentBlock) {
      if (commentDelimiters % 2 === 1) inCommentBlock = !inCommentBlock;
      continue;
    }
    if (commentDelimiters % 2 === 1) {
      inCommentBlock = true;
      continue;
    }

    if (isKanban) {
      if (KANBAN_ARCHIVE_SEPARATOR.test(rawLine)) break;

      const headingMatch = rawLine.match(HEADING_TWO);
      const heading = headingMatch?.[1]?.trim();
      if (heading !== undefined) {
        if (heading.toLocaleLowerCase() === 'archive') break;
        columnNumber += 1;
        currentGroup = heading === ''
          ? `${fileGroup} · 第${columnNumber}列`
          : heading;
        continue;
      }
    }

    const taskMatch = rawLine.match(TASK_LINE);
    const checkbox = taskMatch?.[1];
    const body = taskMatch?.[2];
    if (checkbox === undefined || body === undefined) continue;

    const visibleBody = stripInlineComments(body);
    const start = visibleBody.match(START_DATE)?.[1];
    const due = visibleBody.match(DUE_DATE)?.[1]
      ?? visibleBody.match(KANBAN_DUE_DATE)?.[1];
    const warning = start !== undefined && due !== undefined && start > due
      ? '开始日期晚于截止日期'
      : undefined;
    const title = cleanTitle(visibleBody);
    if (PUNCTUATION_ONLY.test(title)) continue;
    const titleOccurrence = titleOccurrences.get(title) ?? 0;
    titleOccurrences.set(title, titleOccurrence + 1);

    tasks.push({
      id: `${filePath}:${lineNumber}`,
      filePath,
      line: lineNumber,
      rawLine,
      title,
      titleOccurrence,
      done: checkbox.toLocaleLowerCase() === 'x',
      ...(start === undefined ? {} : { start }),
      ...(due === undefined ? {} : { due }),
      tags: extractTags(visibleBody),
      group: isKanban ? currentGroup : fileGroup,
      source,
      ...(warning === undefined ? {} : { warning }),
    });
  }

  return tasks;
}
