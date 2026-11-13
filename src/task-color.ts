import type { Task } from './parser';
import { isPathInScanFolder, normalizeVaultPath } from './scan-scope';

const HEX_COLOR = /^#[0-9a-f]{6}$/iu;
const TASK_COLOR_MARKER_GLOBAL = /\s*%%\s*mt-color\s*:\s*#[0-9a-f]{6}\s*%%/giu;
const INLINE_COMMENT = /%%.*?%%/gu;
export const MAX_RECENT_TASK_COLORS = 8;
export const TASK_COLOR_ORPHAN_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
export const DEFAULT_TASK_COLOR_PALETTE = [
  '#f9dedc',
  '#ef9595',
  '#cfd6e8',
  '#d3efee',
  '#dceab9',
  '#f7e3b5',
  '#e6d5f2',
  '#f4d2b8',
] as const;
const LEGACY_DEFAULT_TASK_COLOR_PALETTE = [
  '#e5484d', '#e08d2d', '#d6a521', '#30a46c',
  '#12a594', '#3e63dd', '#8e4ec6', '#d6409f',
] as const;

export interface StoredTaskColor {
  color: string;
  fingerprint: string;
  orphanedAt?: number;
}

export type StoredTaskColors = Record<string, StoredTaskColor>;

export interface TaskColorReconcileContext {
  scanCompleted: boolean;
  hadReadFailures: boolean;
  scanScopeChanged: boolean;
  scanFolder: string;
  successfulFilePaths: readonly string[];
  existingFilePaths: readonly string[];
  now: number;
  orphanRetentionMs?: number;
}

/** Returns a normalized six-digit hex color, or null for unsafe input. */
export function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  return HEX_COLOR.test(trimmed) ? trimmed.toLowerCase() : null;
}

/** Keeps a safe, unique list of recently used task colors. */
export function normalizeRecentTaskColors(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const colors: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const color = normalizeHexColor(entry);
    if (color !== null && !colors.includes(color)) colors.push(color);
    if (colors.length === MAX_RECENT_TASK_COLORS) break;
  }
  return colors;
}

/** Removes the short-lived vivid starter palette while preserving real color history. */
export function normalizeRememberedTaskColors(value: unknown): string[] {
  const colors = normalizeRecentTaskColors(value);
  const isLegacyStarter = colors.length === LEGACY_DEFAULT_TASK_COLOR_PALETTE.length
    && colors.every((color, index) => color === LEGACY_DEFAULT_TASK_COLOR_PALETTE[index]);
  return isLegacyStarter ? [] : colors;
}

/** Fills empty history slots with a useful eight-color starter palette. */
export function getTaskColorPalette(value: unknown): string[] {
  const colors = normalizeRememberedTaskColors(value);
  for (const preset of DEFAULT_TASK_COLOR_PALETTE) {
    if (!colors.includes(preset)) colors.push(preset);
    if (colors.length === MAX_RECENT_TASK_COLORS) break;
  }
  return colors;
}

/** Moves a saved color to the front of the recent-color list. */
export function rememberRecentTaskColor(recent: unknown, value: string): string[] {
  const color = normalizeHexColor(value);
  const colors = normalizeRememberedTaskColors(recent);
  if (color === null) return colors;
  return [color, ...colors.filter((entry) => entry !== color)]
    .slice(0, MAX_RECENT_TASK_COLORS);
}

/** Removes inline Obsidian comments before extracting visible task metadata. */
export function stripInlineComments(text: string): string {
  return text.replace(INLINE_COMMENT, ' ');
}

/** Removes the abandoned inline marker without disturbing the task content. */
export function removeLegacyTaskColorMarker(rawLine: string): string {
  return rawLine.replace(TASK_COLOR_MARKER_GLOBAL, '').trimEnd();
}

/** Ignores checkbox state so completing a task does not lose its color. */
export function taskColorFingerprint(task: Pick<Task, 'rawLine'>): string {
  return removeLegacyTaskColorMarker(task.rawLine)
    .replace(/^(\s*[-*]\s\[)[ xX](\]\s+)/u, '$1 $2');
}

/** Builds the stable key selected for v0.1 task colors. */
export function taskColorStorageKey(
  task: Pick<Task, 'filePath' | 'title' | 'titleOccurrence'>,
): string {
  return `${task.filePath}\n${task.title}\n${task.titleOccurrence}`;
}

/** Recognizes color records written by e72016b before stable keys were added. */
function legacyTaskColorStorageKey(
  task: Pick<Task, 'filePath' | 'rawLine'>,
): string {
  return `${task.filePath}\n${taskColorFingerprint(task)}`;
}

/** Loads only safe color records from plugin data. */
export function normalizeStoredTaskColors(value: unknown): StoredTaskColors {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const result: StoredTaskColors = {};
  for (const [id, entry] of Object.entries(value)) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
    const candidate = entry as Partial<StoredTaskColor>;
    const color = typeof candidate.color === 'string'
      ? normalizeHexColor(candidate.color)
      : null;
    if (color === null || typeof candidate.fingerprint !== 'string') continue;
    const orphanedAt = typeof candidate.orphanedAt === 'number'
      && Number.isFinite(candidate.orphanedAt)
      && candidate.orphanedAt >= 0
      ? candidate.orphanedAt
      : undefined;
    result[id] = orphanedAt === undefined
      ? { color, fingerprint: candidate.fingerprint }
      : { color, fingerprint: candidate.fingerprint, orphanedAt };
  }
  return result;
}

/** Returns a saved color only when the task still matches the stored source. */
export function getStoredTaskColor(
  task: Pick<Task, 'filePath' | 'rawLine' | 'title' | 'titleOccurrence'>,
  colors: StoredTaskColors,
): string | undefined {
  return colors[taskColorStorageKey(task)]?.color
    ?? colors[legacyTaskColorStorageKey(task)]?.color;
}

/** Adds, replaces, or removes a task color in plugin-owned data. */
export function updateStoredTaskColor(
  colors: StoredTaskColors,
  task: Pick<Task, 'filePath' | 'rawLine' | 'title' | 'titleOccurrence'>,
  value: string | null,
): StoredTaskColors {
  const result = { ...colors };
  const key = taskColorStorageKey(task);
  const legacyKey = legacyTaskColorStorageKey(task);
  delete result[legacyKey];
  if (value === null) {
    delete result[key];
    return result;
  }
  const color = normalizeHexColor(value);
  if (color === null) throw new Error('任务颜色必须是六位十六进制颜色');
  result[key] = { color, fingerprint: taskColorFingerprint(task) };
  return result;
}

/** Moves every color key when its source note is renamed or moved. */
export function renameStoredTaskColorPath(
  colors: StoredTaskColors,
  oldPath: string,
  newPath: string,
): StoredTaskColors {
  const oldPrefix = `${oldPath}\n`;
  const result: StoredTaskColors = {};
  for (const [key, value] of Object.entries(colors)) {
    const nextKey = key.startsWith(oldPrefix)
      ? `${newPath}\n${key.slice(oldPrefix.length)}`
      : key;
    result[nextKey] = value;
  }
  return result;
}

/** Extracts the source note path shared by stable and legacy storage keys. */
function storedTaskColorFilePath(key: string): string {
  return normalizeVaultPath(key.split('\n', 1)[0] ?? '');
}

/**
 * Migrates old keys and conservatively ages records for tasks no longer found.
 * Cleanup is disabled unless the caller can prove the scan is complete and trustworthy.
 */
export function reconcileStoredTaskColors(
  colors: StoredTaskColors,
  tasks: Array<Pick<Task, 'filePath' | 'rawLine' | 'title' | 'titleOccurrence'>>,
  context?: TaskColorReconcileContext,
): StoredTaskColors {
  const result: StoredTaskColors = { ...colors };
  const currentKeys = new Set<string>();
  for (const task of tasks) {
    const stableKey = taskColorStorageKey(task);
    currentKeys.add(stableKey);
    const legacyKey = legacyTaskColorStorageKey(task);
    const entry = colors[stableKey] ?? colors[legacyKey];
    if (entry === undefined) continue;
    delete result[legacyKey];
    result[stableKey] = {
      color: entry.color,
      fingerprint: taskColorFingerprint(task),
    };
  }

  if (
    context === undefined
    || !context.scanCompleted
    || context.hadReadFailures
    || context.scanScopeChanged
  ) return result;

  const scanFolder = normalizeVaultPath(context.scanFolder);
  const successfulFiles = new Set(context.successfulFilePaths.map(normalizeVaultPath));
  const existingFiles = new Set(context.existingFilePaths.map(normalizeVaultPath));
  const retention = context.orphanRetentionMs ?? TASK_COLOR_ORPHAN_RETENTION_MS;

  for (const [key, entry] of Object.entries(result)) {
    if (currentKeys.has(key)) continue;
    const filePath = storedTaskColorFilePath(key);
    if (!isPathInScanFolder(filePath, scanFolder)) continue;
    const fileDeleted = !existingFiles.has(filePath);
    const readButTaskMissing = successfulFiles.has(filePath);
    if (!fileDeleted && !readButTaskMissing) continue;

    if (entry.orphanedAt === undefined) {
      result[key] = { ...entry, orphanedAt: context.now };
      continue;
    }
    if (context.now - entry.orphanedAt >= retention) delete result[key];
  }
  return result;
}
