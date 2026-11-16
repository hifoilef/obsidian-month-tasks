import { App, PluginSettingTab } from 'obsidian';
import type { SettingDefinitionItem } from 'obsidian';
import type MonthTasksPlugin from './main';
import { normalizeTaskColor } from './calendar/task-appearance';
import {
  DEFAULT_SETTINGS,
  MAX_CALENDAR_ZOOM,
  MAX_TASK_WINDOW_DAYS,
  MIN_CALENDAR_ZOOM,
  normalizeCalendarZoom,
  normalizeIntegerSetting,
} from './settings-data';

export * from './settings-data';

type MonthTasksSettingKey =
  | 'scanFolder'
  | 'newTaskDefaultNote'
  | 'calendarZoomPercent'
  | 'defaultTaskColor'
  | 'showTaskMarkers'
  | 'upcomingDays'
  | 'showOverdueTasks'
  | 'overdueLookbackDays';

/** Provides searchable, declarative settings for Obsidian 1.13 and later. */
export class MonthTasksSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: MonthTasksPlugin) {
    super(app, plugin);
  }

  override getSettingDefinitions(): SettingDefinitionItem<MonthTasksSettingKey>[] {
    const defaultNoteDescription = document.createDocumentFragment();
    defaultNoteDescription.append(
      '新建任务默认写入的普通 Markdown 笔记，必须位于扫描文件夹范围内。',
    );
    const defaultNoteWarning = document.createElement('div');
    defaultNoteWarning.classList.add('mt-setting-warning');
    defaultNoteDescription.append(defaultNoteWarning);

    return [
      {
        type: 'group',
        heading: '扫描与默认笔记',
        items: [
          {
            name: '扫描文件夹',
            desc: '留空表示扫描整个库；填写库内文件夹路径可限制扫描范围。',
            control: {
              type: 'text',
              key: 'scanFolder',
              placeholder: '例如：Tasks',
            },
          },
          {
            name: '新任务默认笔记',
            desc: defaultNoteDescription,
            control: {
              type: 'text',
              key: 'newTaskDefaultNote',
              placeholder: DEFAULT_SETTINGS.newTaskDefaultNote,
              validate: async (value) => {
                const { getNewTaskTargetError } = await import('./new-task-note');
                const warning = await getNewTaskTargetError(
                  this.app,
                  value.trim().replace(/\\/gu, '/'),
                  this.plugin.settings.scanFolder,
                );
                defaultNoteWarning.setText(warning ?? '');
                defaultNoteWarning.toggleClass('is-visible', warning !== null);
              },
            },
          },
        ],
      },
      {
        type: 'group',
        heading: '显示',
        items: [
          {
            name: '月历缩放',
            desc: `连续调整月历密度，范围 ${MIN_CALENDAR_ZOOM}%–${MAX_CALENDAR_ZOOM}%。`,
            control: {
              type: 'slider',
              key: 'calendarZoomPercent',
              min: MIN_CALENDAR_ZOOM,
              max: MAX_CALENDAR_ZOOM,
              step: 1,
            },
          },
        ],
      },
      {
        type: 'group',
        heading: '颜色与标记',
        items: [
          {
            name: '默认任务颜色',
            desc: '用于尚未单独选择颜色的任务。',
            control: {
              type: 'color',
              key: 'defaultTaskColor',
            },
          },
          {
            name: '显示任务标记',
            desc: '控制是否显示由你手动设置的自由颜色圆点；月历顶栏也可快速切换。',
            control: {
              type: 'toggle',
              key: 'showTaskMarkers',
            },
          },
        ],
      },
      {
        type: 'group',
        heading: '汇总',
        items: [
          {
            name: '未来任务范围',
            desc: '控制顶栏汇总和弹窗包含今天到未来多少天的未完成任务；0 表示只包含今天。',
            control: {
              type: 'number',
              key: 'upcomingDays',
              min: 0,
              max: MAX_TASK_WINDOW_DAYS,
              step: 1,
            },
          },
          {
            name: '显示逾期任务',
            desc: '控制顶栏汇总和弹窗是否包含逾期任务；关闭后，过去日期中的任务仍会显示在月历里。',
            control: {
              type: 'toggle',
              key: 'showOverdueTasks',
            },
          },
          {
            name: '逾期回溯范围',
            desc: '限制顶栏汇总和弹窗向前包含多少天的逾期任务；0 表示包含全部逾期任务。',
            control: {
              type: 'number',
              key: 'overdueLookbackDays',
              min: 0,
              max: MAX_TASK_WINDOW_DAYS,
              step: 1,
              disabled: () => !this.plugin.settings.showOverdueTasks,
            },
          },
        ],
      },
    ];
  }

  override getControlValue(key: string): unknown {
    if (this.isSettingKey(key)) return this.plugin.settings[key];
    return undefined;
  }

  override async setControlValue(key: string, value: unknown): Promise<void> {
    if (!this.isSettingKey(key)) return;

    switch (key) {
      case 'scanFolder':
        this.plugin.settings.scanFolder = String(value).trim().replace(/^\/+|\/+$/gu, '');
        await this.plugin.saveSettings();
        this.update();
        return;
      case 'newTaskDefaultNote':
        this.plugin.settings.newTaskDefaultNote = String(value).trim().replace(/\\/gu, '/');
        await this.plugin.saveSettings();
        return;
      case 'calendarZoomPercent':
        this.plugin.settings.calendarZoomPercent = normalizeCalendarZoom(Number(value));
        await this.plugin.saveSettings();
        this.plugin.setCalendarZoom(this.plugin.settings.calendarZoomPercent);
        return;
      case 'defaultTaskColor':
        this.plugin.settings.defaultTaskColor = normalizeTaskColor(String(value));
        await this.saveCalendarAppearance();
        return;
      case 'showTaskMarkers':
        this.plugin.settings.showTaskMarkers = Boolean(value);
        await this.saveCalendarAppearance();
        return;
      case 'upcomingDays':
        this.plugin.settings.upcomingDays = normalizeIntegerSetting(
          Number(value),
          DEFAULT_SETTINGS.upcomingDays,
          0,
          MAX_TASK_WINDOW_DAYS,
        );
        await this.saveCalendarAppearance();
        return;
      case 'showOverdueTasks':
        this.plugin.settings.showOverdueTasks = Boolean(value);
        await this.saveCalendarAppearance();
        this.update();
        return;
      case 'overdueLookbackDays':
        this.plugin.settings.overdueLookbackDays = normalizeIntegerSetting(
          Number(value),
          DEFAULT_SETTINGS.overdueLookbackDays,
          0,
          MAX_TASK_WINDOW_DAYS,
        );
        await this.saveCalendarAppearance();
    }
  }

  private isSettingKey(key: string): key is MonthTasksSettingKey {
    return key in this.plugin.settings;
  }

  private async saveCalendarAppearance(): Promise<void> {
    await this.plugin.saveSettings();
    this.plugin.refreshCalendarAppearance();
  }
}
