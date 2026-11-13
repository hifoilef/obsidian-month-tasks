import {
  FALLBACK_TASK_COLOR,
  normalizeTaskColor,
} from './calendar/task-appearance';
import {
  normalizeRememberedTaskColors,
  normalizeStoredTaskColors,
  type StoredTaskColors,
} from './task-color';

/** Persisted settings for scanning and task appearance. */
export interface MonthTasksSettings {
  schemaVersion: number;
  scanFolder: string;
  /** Last successfully established cleanup scope; internal and not shown as a setting. */
  colorCleanupScanFolder: string | null;
  newTaskDefaultNote: string;
  upcomingDays: number;
  showOverdueTasks: boolean;
  overdueLookbackDays: number;
  showTaskMarkers: boolean;
  calendarZoomPercent: number;
  pendingPanelVisible: boolean;
  pendingCollapsedGroups: string[];
  defaultTaskColor: string;
  recentTaskColors: string[];
  taskColors: StoredTaskColors;
  taskMarkerColors: StoredTaskColors;
}

export const MIN_CALENDAR_ZOOM = 60;
export const MAX_CALENDAR_ZOOM = 130;
export const MAX_TASK_WINDOW_DAYS = 365;
export const CURRENT_SCHEMA_VERSION = 1;

/** Keeps persisted numeric display settings inside their supported range. */
export function normalizeIntegerSetting(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

export function normalizeCalendarZoom(value: unknown): number {
  return normalizeIntegerSetting(value, 100, MIN_CALENDAR_ZOOM, MAX_CALENDAR_ZOOM);
}

export const DEFAULT_SETTINGS: MonthTasksSettings = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  scanFolder: '',
  colorCleanupScanFolder: null,
  newTaskDefaultNote: 'Month Tasks/任务收集.md',
  upcomingDays: 7,
  showOverdueTasks: false,
  overdueLookbackDays: 0,
  showTaskMarkers: true,
  calendarZoomPercent: 100,
  pendingPanelVisible: false,
  pendingCollapsedGroups: [],
  defaultTaskColor: FALLBACK_TASK_COLOR,
  recentTaskColors: [],
  taskColors: {},
  taskMarkerColors: {},
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Provides the migration seam for future persisted-data schema changes. */
export function upgradeSettingsData(value: unknown): Record<string, unknown> {
  const source = isRecord(value) ? { ...value } : {};
  const savedVersion = typeof source.schemaVersion === 'number'
    && Number.isInteger(source.schemaVersion)
    ? source.schemaVersion
    : 0;
  // Version 0 is the pre-versioning shape. Version 1 keeps the same user fields.
  if (savedVersion <= CURRENT_SCHEMA_VERSION) {
    source.schemaVersion = CURRENT_SCHEMA_VERSION;
  }
  return source;
}

/** Normalizes every persisted field independently so one bad field cannot poison the rest. */
export function normalizeMonthTasksSettings(value: unknown): MonthTasksSettings {
  const saved = upgradeSettingsData(value);
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    scanFolder: typeof saved.scanFolder === 'string'
      ? saved.scanFolder
      : DEFAULT_SETTINGS.scanFolder,
    colorCleanupScanFolder: typeof saved.colorCleanupScanFolder === 'string'
      ? saved.colorCleanupScanFolder
      : null,
    newTaskDefaultNote: typeof saved.newTaskDefaultNote === 'string'
      ? saved.newTaskDefaultNote
      : DEFAULT_SETTINGS.newTaskDefaultNote,
    upcomingDays: normalizeIntegerSetting(
      saved.upcomingDays,
      DEFAULT_SETTINGS.upcomingDays,
      0,
      MAX_TASK_WINDOW_DAYS,
    ),
    showOverdueTasks: typeof saved.showOverdueTasks === 'boolean'
      ? saved.showOverdueTasks
      : DEFAULT_SETTINGS.showOverdueTasks,
    overdueLookbackDays: normalizeIntegerSetting(
      saved.overdueLookbackDays,
      DEFAULT_SETTINGS.overdueLookbackDays,
      0,
      MAX_TASK_WINDOW_DAYS,
    ),
    showTaskMarkers: typeof saved.showTaskMarkers === 'boolean'
      ? saved.showTaskMarkers
      : typeof saved.showUrgencyIndicators === 'boolean'
        ? saved.showUrgencyIndicators
        : DEFAULT_SETTINGS.showTaskMarkers,
    calendarZoomPercent: normalizeCalendarZoom(saved.calendarZoomPercent),
    pendingPanelVisible: typeof saved.pendingPanelVisible === 'boolean'
      ? saved.pendingPanelVisible
      : DEFAULT_SETTINGS.pendingPanelVisible,
    pendingCollapsedGroups: Array.isArray(saved.pendingCollapsedGroups)
      ? saved.pendingCollapsedGroups.filter(
        (path): path is string => typeof path === 'string',
      )
      : [],
    defaultTaskColor: normalizeTaskColor(
      typeof saved.defaultTaskColor === 'string'
        ? saved.defaultTaskColor
        : DEFAULT_SETTINGS.defaultTaskColor,
    ),
    recentTaskColors: normalizeRememberedTaskColors(saved.recentTaskColors),
    taskColors: normalizeStoredTaskColors(saved.taskColors),
    taskMarkerColors: normalizeStoredTaskColors(saved.taskMarkerColors),
  };
}
