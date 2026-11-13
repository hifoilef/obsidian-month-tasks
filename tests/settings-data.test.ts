import { describe, expect, it, vi } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_SETTINGS,
  normalizeMonthTasksSettings,
} from '../src/settings-data';
import {
  backupCorruptPluginData,
  loadPluginDataSafely,
} from '../src/settings-storage';

describe('persisted settings data', () => {
  it('loads a missing data file as defaults without treating it as corruption', async () => {
    const backup = vi.fn(async () => null);
    const loaded = await loadPluginDataSafely(async () => null, backup);
    expect(loaded).toEqual({ data: null, recoveredFromCorruption: false, backupPath: null });
    expect(backup).not.toHaveBeenCalled();
    expect(normalizeMonthTasksSettings(loaded.data)).toEqual(
      normalizeMonthTasksSettings(null),
    );
  });

  it('uses independent defaults for a missing file and an empty object', () => {
    const missing = normalizeMonthTasksSettings(null);
    const empty = normalizeMonthTasksSettings({});
    expect(missing.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(empty).toEqual(missing);
    expect(empty).not.toBe(DEFAULT_SETTINGS);
    expect(empty.taskColors).not.toBe(DEFAULT_SETTINGS.taskColors);
  });

  it('falls back per invalid field without losing valid fields', () => {
    const settings = normalizeMonthTasksSettings({
      scanFolder: 'Tasks',
      upcomingDays: 'seven',
      showOverdueTasks: true,
      calendarZoomPercent: 999,
      pendingCollapsedGroups: ['one.md', 2, null],
      taskColors: { invalid: { color: 'red', fingerprint: 'x' } },
    });
    expect(settings.scanFolder).toBe('Tasks');
    expect(settings.upcomingDays).toBe(DEFAULT_SETTINGS.upcomingDays);
    expect(settings.showOverdueTasks).toBe(true);
    expect(settings.calendarZoomPercent).toBe(130);
    expect(settings.pendingCollapsedGroups).toEqual(['one.md']);
    expect(settings.taskColors).toEqual({});
  });

  it('falls every malformed persisted field back independently', () => {
    const settings = normalizeMonthTasksSettings({
      schemaVersion: 'one',
      scanFolder: 1,
      colorCleanupScanFolder: false,
      newTaskDefaultNote: [],
      upcomingDays: '7',
      showOverdueTasks: 'yes',
      overdueLookbackDays: null,
      showTaskMarkers: 1,
      calendarZoomPercent: '100',
      pendingPanelVisible: 'false',
      pendingCollapsedGroups: {},
      defaultTaskColor: 'red',
      recentTaskColors: ['red'],
      taskColors: [],
      taskMarkerColors: 'bad',
    });
    expect(settings).toEqual(normalizeMonthTasksSettings(null));
  });

  it('upgrades pre-versioned data to schema version 1', () => {
    const settings = normalizeMonthTasksSettings({
      scanFolder: 'Legacy',
      showUrgencyIndicators: false,
    });
    expect(settings.schemaVersion).toBe(1);
    expect(settings.scanFolder).toBe('Legacy');
    expect(settings.showTaskMarkers).toBe(false);
  });

  it('backs up damaged JSON as data.json.bak before returning defaults', async () => {
    const writes: Array<{ path: string; data: string }> = [];
    const adapter = {
      exists: vi.fn(async (path: string) => !path.endsWith('.bak')),
      read: vi.fn(async () => '{broken json'),
      write: vi.fn(async (path: string, data: string) => {
        writes.push({ path, data });
      }),
    };
    let backupFinished = false;
    const loaded = await loadPluginDataSafely(
      async () => { throw new SyntaxError('Unexpected token'); },
      async () => {
        const backupPath = await backupCorruptPluginData(
          adapter,
          '.obsidian/plugins/month-tasks/data.json',
        );
        backupFinished = true;
        return backupPath;
      },
    );
    expect(backupFinished).toBe(true);
    expect(writes).toEqual([{
      path: '.obsidian/plugins/month-tasks/data.json.bak',
      data: '{broken json',
    }]);
    expect(loaded).toEqual({
      data: null,
      recoveredFromCorruption: true,
      backupPath: '.obsidian/plugins/month-tasks/data.json.bak',
    });
    expect(normalizeMonthTasksSettings(loaded.data).schemaVersion).toBe(1);
  });

  it('keeps existing backups and adds timestamp and collision suffixes', async () => {
    const files = new Map<string, string>([
      ['data.json', '{second broken json'],
      ['data.json.bak', '{first broken json'],
      ['data.json.bak-20261020-183000', '{same-second backup'],
    ]);
    const adapter = {
      exists: async (path: string) => files.has(path),
      read: async (path: string) => files.get(path) ?? '',
      write: async (path: string, data: string) => { files.set(path, data); },
    };
    const backupPath = await backupCorruptPluginData(
      adapter,
      'data.json',
      new Date(2026, 9, 20, 18, 30, 0),
    );

    expect(backupPath).toBe('data.json.bak-20261020-183000-2');
    expect(files.get('data.json.bak')).toBe('{first broken json');
    expect(files.get('data.json.bak-20261020-183000-2')).toBe('{second broken json');
  });
});
