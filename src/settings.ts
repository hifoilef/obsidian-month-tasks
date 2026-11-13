import { App, PluginSettingTab, Setting } from 'obsidian';
import type MonthTasksPlugin from './main';
import {
  normalizeTaskColor,
} from './calendar/task-appearance';
import {
  DEFAULT_SETTINGS,
  MAX_CALENDAR_ZOOM,
  MAX_TASK_WINDOW_DAYS,
  MIN_CALENDAR_ZOOM,
  normalizeCalendarZoom,
  normalizeIntegerSetting,
} from './settings-data';

export * from './settings-data';

/** Renders scan scope and user-configurable task appearance. */
export class MonthTasksSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: MonthTasksPlugin) {
    super(app, plugin);
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('扫描与默认笔记')
      .setHeading();
    containerEl.createEl('p', {
      cls: 'setting-item-description',
      text: '选择读取任务的范围，以及从月历新建任务时默认写入的普通 Markdown 笔记。',
    });

    let updateDefaultNoteWarning = async (): Promise<void> => undefined;
    new Setting(containerEl)
      .setName('扫描文件夹')
      .setDesc('留空表示扫描整个库；填写库内文件夹路径可限制扫描范围。')
      .addText((text) =>
        text
          .setPlaceholder('例如：Tasks')
          .setValue(this.plugin.settings.scanFolder)
          .onChange(async (value) => {
            this.plugin.settings.scanFolder = value.trim().replace(/^\/+|\/+$/gu, '');
            await this.plugin.saveSettings();
            await updateDefaultNoteWarning();
          }),
      );

    const defaultNoteSetting = new Setting(containerEl)
      .setName('新任务默认笔记')
      .setDesc('新建任务默认写入的普通 Markdown 笔记，必须位于扫描文件夹范围内。')
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.newTaskDefaultNote)
          .setValue(this.plugin.settings.newTaskDefaultNote)
          .onChange(async (value) => {
            this.plugin.settings.newTaskDefaultNote = value.trim().replace(/\\/gu, '/');
            await this.plugin.saveSettings();
            await updateDefaultNoteWarning();
          }),
      );
    const warningEl = defaultNoteSetting.descEl.createDiv({ cls: 'mt-setting-warning' });
    updateDefaultNoteWarning = async () => {
      const { getNewTaskTargetError } = await import('./new-task-note');
      const warning = await getNewTaskTargetError(
        this.app,
        this.plugin.settings.newTaskDefaultNote,
        this.plugin.settings.scanFolder,
      );
      if (!warningEl.isConnected) return;
      warningEl.setText(warning ?? '');
      warningEl.toggleClass('is-visible', warning !== null);
    };
    void updateDefaultNoteWarning();

    new Setting(containerEl)
      .setName('显示')
      .setHeading();
    containerEl.createEl('p', {
      cls: 'setting-item-description',
      text: '调整月历内容的显示密度；月历顶栏中的滑块会同步这一数值。',
    });

    new Setting(containerEl)
      .setName('月历缩放')
      .setDesc(`连续调整月历密度，范围 ${MIN_CALENDAR_ZOOM}%–${MAX_CALENDAR_ZOOM}%。`)
      .addSlider((slider) =>
        slider
          .setLimits(MIN_CALENDAR_ZOOM, MAX_CALENDAR_ZOOM, 1)
          .setValue(this.plugin.settings.calendarZoomPercent)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.calendarZoomPercent = normalizeCalendarZoom(value);
            await this.plugin.saveSettings();
            this.plugin.setCalendarZoom(this.plugin.settings.calendarZoomPercent);
          }),
      );

    new Setting(containerEl)
      .setName('颜色与标记')
      .setHeading();
    containerEl.createEl('p', {
      cls: 'setting-item-description',
      text: '卡片颜色和圆点标记是两套独立数据，都只保存在插件数据中，不写进笔记正文。',
    });

    new Setting(containerEl)
      .setName('默认任务颜色')
      .setDesc('用于尚未单独选择颜色的任务。')
      .addColorPicker((picker) =>
        picker
          .setValue(this.plugin.settings.defaultTaskColor)
          .onChange(async (value) => {
            this.plugin.settings.defaultTaskColor = normalizeTaskColor(value);
            await this.saveAppearance();
          }),
      );

    new Setting(containerEl)
      .setName('显示任务标记')
      .setDesc('控制是否显示由你手动设置的自由颜色圆点；月历顶栏也可快速切换。')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showTaskMarkers)
          .onChange(async (value) => {
            this.plugin.settings.showTaskMarkers = value;
            await this.saveCalendarDisplay();
          }),
      );

    new Setting(containerEl)
      .setName('汇总')
      .setHeading();
    containerEl.createEl('p', {
      cls: 'setting-item-description',
      text: '这些选项只调整顶栏任务汇总及其弹窗，不会从月历日期格中隐藏任务。',
    });

    new Setting(containerEl)
      .setName('未来任务范围')
      .setDesc('控制顶栏汇总和弹窗包含今天到未来多少天的未完成任务；0 表示只包含今天。')
      .addText((text) => {
        text.inputEl.type = 'number';
        text.inputEl.min = '0';
        text.inputEl.max = String(MAX_TASK_WINDOW_DAYS);
        text.inputEl.step = '1';
        text
          .setValue(String(this.plugin.settings.upcomingDays))
          .onChange(async (value) => {
            if (value.trim() === '') return;
            const parsed = Number(value);
            if (!Number.isFinite(parsed)) return;
            this.plugin.settings.upcomingDays = normalizeIntegerSetting(
              parsed,
              DEFAULT_SETTINGS.upcomingDays,
              0,
              MAX_TASK_WINDOW_DAYS,
            );
            await this.saveCalendarDisplay();
          });
      });

    let updateOverdueRangeState = (): void => undefined;
    new Setting(containerEl)
      .setName('显示逾期任务')
      .setDesc('控制顶栏汇总和弹窗是否包含逾期任务；关闭后，过去日期中的任务仍会显示在月历里。')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showOverdueTasks)
          .onChange(async (value) => {
            this.plugin.settings.showOverdueTasks = value;
            updateOverdueRangeState();
            await this.saveCalendarDisplay();
          }),
      );

    const overdueRangeSetting = new Setting(containerEl)
      .setName('逾期回溯范围')
      .setDesc('限制顶栏汇总和弹窗向前包含多少天的逾期任务；0 表示包含全部逾期任务。')
      .addText((text) => {
        text.inputEl.type = 'number';
        text.inputEl.min = '0';
        text.inputEl.max = String(MAX_TASK_WINDOW_DAYS);
        text.inputEl.step = '1';
        text
          .setValue(String(this.plugin.settings.overdueLookbackDays))
          .onChange(async (value) => {
            if (value.trim() === '') return;
            const parsed = Number(value);
            if (!Number.isFinite(parsed)) return;
            this.plugin.settings.overdueLookbackDays = normalizeIntegerSetting(
              parsed,
              DEFAULT_SETTINGS.overdueLookbackDays,
              0,
              MAX_TASK_WINDOW_DAYS,
            );
            await this.saveCalendarDisplay();
          });
        updateOverdueRangeState = () => {
          text.inputEl.disabled = !this.plugin.settings.showOverdueTasks;
          overdueRangeSetting.settingEl.toggleClass(
            'is-disabled',
            !this.plugin.settings.showOverdueTasks,
          );
        };
      });
    updateOverdueRangeState();

  }

  /** Saves appearance changes and refreshes already-open calendar views. */
  private async saveAppearance(): Promise<void> {
    await this.plugin.saveSettings();
    this.plugin.refreshCalendarAppearance();
  }

  /** Saves summary and marker settings and immediately repaints open views. */
  private async saveCalendarDisplay(): Promise<void> {
    await this.plugin.saveSettings();
    this.plugin.refreshCalendarAppearance();
  }
}
