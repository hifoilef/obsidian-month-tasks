import { normalizePath, Notice, Plugin, TFile } from 'obsidian';
import { MonthTasksView, VIEW_TYPE_MONTH_TASKS } from './calendar/view';
import { VaultTaskScanner, type VaultScanResult } from './scanner';
import {
  MonthTasksSettingTab,
  normalizeMonthTasksSettings,
  type MonthTasksSettings,
} from './settings';
import {
  reconcileStoredTaskColors,
  renameStoredTaskColorPath,
} from './task-color';
import { normalizeVaultPath } from './scan-scope';
import { backupCorruptPluginData, loadPluginDataSafely } from './settings-storage';

/** Obsidian entry point for Month Tasks. */
export default class MonthTasksPlugin extends Plugin {
  override settings: MonthTasksSettings = normalizeMonthTasksSettings(null);
  private readonly taskScanner = new VaultTaskScanner((filePath, error) => {
    console.error(`Month Tasks failed to read ${filePath}:`, error);
    new Notice(`Month Tasks：无法读取 ${filePath}，暂时保留上次任务结果`);
  });

  override async onload(): Promise<void> {
    await this.loadSettings();
    this.registerView(
      VIEW_TYPE_MONTH_TASKS,
      (leaf) => new MonthTasksView(leaf, this),
    );
    this.addSettingTab(new MonthTasksSettingTab(this.app, this));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      if (file instanceof TFile) void this.renameTaskColors(oldPath, file.path);
    }));

    this.addRibbonIcon('calendar-days', '打开月历', () => {
      void this.openCalendar();
    });

    this.addCommand({
      id: 'open-calendar',
      name: '打开月历',
      callback: async () => this.openCalendar(),
    });

  }

  /** Scans with a plugin-lifetime fallback cache for temporarily unreadable files. */
  async scanTasks(): Promise<VaultScanResult> {
    return this.taskScanner.scan(this.app, this.settings);
  }

  /** Opens the calendar or focuses the existing calendar leaf. */
  async openCalendar(): Promise<void> {
    const existingLeaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_MONTH_TASKS)[0];
    if (existingLeaf !== undefined) {
      await this.app.workspace.revealLeaf(existingLeaf);
      return;
    }

    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE_MONTH_TASKS, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  /** Loads settings and fills any newly added defaults. */
  async loadSettings(): Promise<void> {
    const loaded = await loadPluginDataSafely(
      async () => this.loadData() as Promise<unknown>,
      async () => this.backupCorruptDataFile(),
    );
    this.settings = normalizeMonthTasksSettings(loaded.data);
    await this.saveSettings();
    if (loaded.recoveredFromCorruption) {
      const backupName = loaded.backupPath?.split('/').at(-1) ?? '备份文件';
      new Notice(`Month Tasks：设置文件损坏，已备份为 ${backupName} 并使用默认设置`);
    }
  }

  /** Preserves unreadable bytes before saveData replaces the damaged settings file. */
  private async backupCorruptDataFile(): Promise<string | null> {
    const pluginDir = this.manifest.dir
      ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
    const dataPath = normalizePath(`${pluginDir}/data.json`);
    return backupCorruptPluginData(this.app.vault.adapter, dataPath);
  }

  /** Persists the current plugin settings. */
  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** Keeps task colors attached when a source note is renamed or moved. */
  private async renameTaskColors(oldPath: string, newPath: string): Promise<void> {
    const renamed = renameStoredTaskColorPath(this.settings.taskColors, oldPath, newPath);
    const renamedMarkers = renameStoredTaskColorPath(
      this.settings.taskMarkerColors,
      oldPath,
      newPath,
    );
    if (
      JSON.stringify(renamed) === JSON.stringify(this.settings.taskColors)
      && JSON.stringify(renamedMarkers) === JSON.stringify(this.settings.taskMarkerColors)
    ) return;
    this.settings.taskColors = renamed;
    this.settings.taskMarkerColors = renamedMarkers;
    await this.saveSettings();
  }

  /** Migrates old keys and conservatively ages colors missing from a trustworthy scan. */
  async reconcileTaskColors(scan: VaultScanResult): Promise<void> {
    const scanFolder = normalizeVaultPath(this.settings.scanFolder);
    const scanScopeChanged = this.settings.colorCleanupScanFolder !== scanFolder;
    const context = {
      scanCompleted: true,
      hadReadFailures: scan.hadReadFailures,
      scanScopeChanged,
      scanFolder,
      successfulFilePaths: scan.successfulFilePaths,
      existingFilePaths: scan.existingFilePaths,
      now: Date.now(),
    };
    const reconciled = reconcileStoredTaskColors(
      this.settings.taskColors,
      scan.tasks,
      context,
    );
    const reconciledMarkers = reconcileStoredTaskColors(
      this.settings.taskMarkerColors,
      scan.tasks,
      context,
    );
    if (
      JSON.stringify(reconciled) === JSON.stringify(this.settings.taskColors)
      && JSON.stringify(reconciledMarkers) === JSON.stringify(this.settings.taskMarkerColors)
      && !scanScopeChanged
    ) return;
    this.settings.taskColors = reconciled;
    this.settings.taskMarkerColors = reconciledMarkers;
    this.settings.colorCleanupScanFolder = scanFolder;
    await this.saveSettings();
  }

  /** Renders new colors immediately in every open Month Tasks view. */
  refreshCalendarAppearance(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_MONTH_TASKS)) {
      if (leaf.view instanceof MonthTasksView) leaf.view.refreshAppearance();
    }
  }

  /** Applies a persisted zoom preference to every open calendar view. */
  setCalendarZoom(percent: number): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_MONTH_TASKS)) {
      if (leaf.view instanceof MonthTasksView) leaf.view.setZoomPercent(percent);
    }
  }
}
