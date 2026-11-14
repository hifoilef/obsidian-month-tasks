import { ItemView, Menu, Notice, TFile, type WorkspaceLeaf } from 'obsidian';
import type MonthTasksPlugin from '../main';
import type { Task } from '../parser';
import {
  buildMonthWeeks,
  formatIsoDate,
  getRenderableTaskDate,
  getIsoWeekNumber,
  startOfMonth,
} from './date-utils';
import {
  isMultiDayTask,
  layoutWeekBars,
  type WeekBarSegment,
} from './layout-week-bars';
import { DayTasksModal } from './task-modal';
import { layoutDayRows } from './layout-day-rows';
import { TaskColorModal } from './task-color-modal';
import { TaskMarkerColorModal } from './task-marker-color-modal';
import { NewTaskModal } from './new-task-modal';
import { UpcomingTasksModal } from './upcoming-modal';
import { getUpcomingSummary } from './upcoming';
import { groupPendingTasks, type PendingTaskGroup } from './pending';
import { setTaskLineCompletion, updateTaskCompletionInContent } from '../task-completion';
import {
  getStoredTaskColor,
  rememberRecentTaskColor,
  updateStoredTaskColor,
} from '../task-color';
import {
  getTaskColor,
} from './task-appearance';
import {
  MAX_CALENDAR_ZOOM,
  MIN_CALENDAR_ZOOM,
  normalizeCalendarZoom,
} from '../settings';
import {
  hasLocalDateChanged,
  isCurrentRefreshGeneration,
} from './refresh-policy';

export const VIEW_TYPE_MONTH_TASKS = 'month-tasks-calendar';

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
const MAX_VISIBLE_TASKS = 3;
const PENDING_DRAWER_BREAKPOINT = 864;
const LOCAL_DATE_CHECK_INTERVAL_MS = 60_000;

/** Calendar ItemView for the single-day rendering milestone. */
export class MonthTasksView extends ItemView {
  private displayedMonth = startOfMonth(new Date());
  private tasks: Task[] = [];
  private refreshTimer: number | undefined;
  private refreshGeneration = 0;
  private lastRenderedLocalDate = formatIsoDate(new Date());
  private zoomPercent: number;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: MonthTasksPlugin,
  ) {
    super(leaf);
    this.zoomPercent = normalizeCalendarZoom(plugin.settings.calendarZoomPercent);
  }

  override getViewType(): string {
    return VIEW_TYPE_MONTH_TASKS;
  }

  override getDisplayText(): string {
    return '月历任务';
  }

  override getIcon(): string {
    return 'calendar-days';
  }

  override async onOpen(): Promise<void> {
    this.contentEl.addClass('mt-calendar-view');
    this.renderCalendar();

    this.registerEvent(this.app.vault.on('modify', () => this.scheduleRefresh()));
    this.registerEvent(this.app.vault.on('create', () => this.scheduleRefresh()));
    this.registerEvent(this.app.vault.on('delete', () => this.scheduleRefresh()));
    this.registerEvent(this.app.vault.on('rename', () => this.scheduleRefresh()));
    this.registerInterval(window.setInterval(() => {
      this.refreshForLocalDateChange();
    }, LOCAL_DATE_CHECK_INTERVAL_MS));

    await this.refreshTasks();
  }

  override async onClose(): Promise<void> {
    if (this.refreshTimer !== undefined) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = undefined;
    this.refreshGeneration += 1;
    this.contentEl.empty();
  }

  /** Repaints colors without rescanning the vault. */
  refreshAppearance(): void {
    this.renderCalendar();
  }

  /** Applies a zoom value changed from the plugin settings page. */
  setZoomPercent(percent: number): void {
    this.zoomPercent = normalizeCalendarZoom(percent);
    this.renderCalendar();
  }

  /** Debounces vault changes before rescanning. */
  private scheduleRefresh(): void {
    if (this.refreshTimer !== undefined) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = undefined;
      void this.refreshTasks();
    }, 500);
  }

  /** Rescans the configured vault scope and rerenders the current month. */
  private async refreshTasks(): Promise<void> {
    const generation = ++this.refreshGeneration;
    try {
      const scan = await this.plugin.scanTasks();
      if (!isCurrentRefreshGeneration(generation, this.refreshGeneration)) return;
      await this.plugin.reconcileTaskColors(scan);
      this.tasks = scan.tasks;
      this.renderCalendar();
    } catch (error) {
      console.error('Month Tasks failed to refresh the calendar:', error);
      new Notice('Month Tasks：刷新月历失败，请查看控制台');
    }
  }

  /** Repaints from the existing task snapshot after the local day rolls over. */
  private refreshForLocalDateChange(): void {
    const now = new Date();
    if (!hasLocalDateChanged(this.lastRenderedLocalDate, now)) return;
    this.lastRenderedLocalDate = formatIsoDate(now);
    this.renderCalendar();
  }

  /** Moves the visible month while keeping its day normalized to one. */
  private shiftMonth(offset: number): void {
    this.displayedMonth = new Date(
      this.displayedMonth.getFullYear(),
      this.displayedMonth.getMonth() + offset,
      1,
      12,
    );
    this.renderCalendar();
  }

  /** Groups tasks that are not valid ascending ranges by their single display date. */
  private groupSingleDayTasks(): Map<string, Task[]> {
    const result = new Map<string, Task[]>();

    for (const task of this.tasks) {
      if (isMultiDayTask(task)) continue;
      const isoDate = getRenderableTaskDate(task);
      if (isoDate === null) continue;
      const tasks = result.get(isoDate) ?? [];
      tasks.push(task);
      result.set(isoDate, tasks);
    }

    return result;
  }

  /** Renders the toolbar, weekday header, week numbers, and day cells. */
  private renderCalendar(): void {
    this.contentEl.empty();
    this.applyZoomStyles();
    const today = formatIsoDate(new Date());
    this.lastRenderedLocalDate = today;
    const pendingGroups = groupPendingTasks(
      this.tasks,
      this.plugin.settings.newTaskDefaultNote,
    );
    const pendingCount = pendingGroups.reduce(
      (count, group) => count + group.tasks.length,
      0,
    );
    const toolbar = this.contentEl.createDiv({ cls: 'mt-toolbar' });
    const toolbarHeading = toolbar.createDiv({ cls: 'mt-toolbar-heading' });
    toolbarHeading.createEl('h2', {
      cls: 'mt-month-title',
      text: `${this.displayedMonth.getFullYear()}年${this.displayedMonth.getMonth() + 1}月`,
    });
    this.createToolbarButton(toolbarHeading, '+ 新建任务', () => this.openNewTaskModal(today));

    const toolbarControls = toolbar.createDiv({ cls: 'mt-toolbar-controls' });
    const navigation = toolbarControls.createDiv({
      cls: 'mt-toolbar-group mt-toolbar-navigation',
    });
    this.createToolbarButton(navigation, '上一月', () => this.shiftMonth(-1));
    this.createToolbarButton(navigation, '下一月', () => this.shiftMonth(1));
    this.createToolbarButton(navigation, '今天', () => {
      this.displayedMonth = startOfMonth(new Date());
      this.renderCalendar();
    });

    const zoomControl = toolbarControls.createDiv({ cls: 'mt-zoom-control' });
    zoomControl.createSpan({ cls: 'mt-zoom-caption', text: '缩放' });
    const zoomSlider = zoomControl.createEl('input', {
      cls: 'mt-zoom-slider',
      attr: {
        type: 'range',
        min: String(MIN_CALENDAR_ZOOM),
        max: String(MAX_CALENDAR_ZOOM),
        step: '1',
        value: String(this.zoomPercent),
        'aria-label': '调整月历缩放比例',
      },
    });
    const zoomLabel = zoomControl.createSpan({
      cls: 'mt-zoom-label',
      text: `${this.zoomPercent}%`,
    });
    zoomSlider.addEventListener('input', () => {
      this.zoomPercent = normalizeCalendarZoom(Number(zoomSlider.value));
      this.applyZoomStyles();
      zoomLabel.setText(`${this.zoomPercent}%`);
    });
    zoomSlider.addEventListener('change', async () => {
      this.plugin.settings.calendarZoomPercent = this.zoomPercent;
      await this.plugin.saveSettings();
    });

    const upcomingDays = this.plugin.settings.upcomingDays;
    const upcomingLabel = upcomingDays === 0 ? '今天' : `${upcomingDays}天内`;
    const upcoming = getUpcomingSummary(this.tasks, today, {
      upcomingDays,
      showOverdue: this.plugin.settings.showOverdueTasks,
      overdueLookbackDays: this.plugin.settings.overdueLookbackDays,
    });
    const summaryText = upcoming.overdueCount > 0
      ? `${upcomingLabel} ${upcoming.upcomingCount} · 逾期 ${upcoming.overdueCount}`
      : `${upcomingLabel} ${upcoming.upcomingCount}`;
    const summaryButton = toolbarControls.createEl('button', {
      cls: 'mt-upcoming-summary',
      text: summaryText,
    });
    summaryButton.addEventListener('click', () => {
      new UpcomingTasksModal(
        this.app,
        upcoming.items,
        upcomingLabel,
        this.plugin.settings.showOverdueTasks,
        async (task) => this.openTask(task),
        async (task, done) => this.toggleTaskCompletion(task, done),
      ).open();
    });
    const pendingButton = toolbarControls.createEl('button', {
      cls: `mt-toolbar-button mt-pending-toggle${this.plugin.settings.pendingPanelVisible ? ' is-active' : ''}`,
      text: `待安排 ${pendingCount}`,
      attr: {
        'aria-pressed': String(this.plugin.settings.pendingPanelVisible),
        title: '显示或隐藏没有开始日期和截止日期的任务',
      },
    });
    pendingButton.addEventListener('click', () => {
      void this.setPendingPanelVisible(!this.plugin.settings.pendingPanelVisible);
    });
    const markerToggle = toolbarControls.createEl('label', {
      cls: 'mt-marker-toggle',
      attr: { title: '显示或隐藏任务右侧的自由颜色标记' },
    });
    const markerCheckbox = markerToggle.createEl('input', {
      attr: { type: 'checkbox', 'aria-label': '显示任务标记' },
    });
    markerCheckbox.checked = this.plugin.settings.showTaskMarkers;
    markerToggle.createSpan({ text: '任务标记' });
    markerCheckbox.addEventListener('change', async () => {
      this.plugin.settings.showTaskMarkers = markerCheckbox.checked;
      await this.plugin.saveSettings();
      this.plugin.refreshCalendarAppearance();
    });

    const layout = this.contentEl.createDiv({
      cls: `mt-calendar-layout${this.plugin.settings.pendingPanelVisible ? ' has-pending-panel' : ''}`,
    });
    const calendarMain = layout.createDiv({ cls: 'mt-calendar-main' });
    const scroll = calendarMain.createDiv({ cls: 'mt-calendar-scroll' });
    const calendar = scroll.createDiv({ cls: 'mt-calendar-grid' });
    const header = calendar.createDiv({ cls: 'mt-calendar-header' });
    header.createDiv({ cls: 'mt-week-header', text: '周' });
    for (const label of WEEKDAY_LABELS) {
      header.createDiv({ cls: 'mt-weekday-header', text: label });
    }

    const year = this.displayedMonth.getFullYear();
    const month = this.displayedMonth.getMonth();
    const weeks = buildMonthWeeks(year, month);
    const firstVisibleDay = weeks[0]?.[0];
    const lastWeek = weeks.at(-1);
    const lastVisibleDay = lastWeek?.at(-1);
    if (firstVisibleDay === undefined || lastVisibleDay === undefined) return;
    const barSegments = layoutWeekBars(
      this.tasks,
      firstVisibleDay.isoDate,
      lastVisibleDay.isoDate,
    );
    const singleTasksByDate = this.groupSingleDayTasks();

    for (let weekIndex = 0; weekIndex < weeks.length; weekIndex += 1) {
      const week = weeks[weekIndex];
      if (week === undefined) continue;
      const firstDay = week[0];
      if (firstDay === undefined) continue;
      const weekRow = calendar.createDiv({ cls: 'mt-week-row' });
      const weekSegments = barSegments.filter(
        (segment) => segment.weekIndex === weekIndex,
      );
      weekRow.createDiv({
        cls: 'mt-week-number',
        text: String(getIsoWeekNumber(firstDay.date)),
      });

      for (let dayIndex = 0; dayIndex < week.length; dayIndex += 1) {
        const day = week[dayIndex];
        if (day === undefined) continue;
        const dayCell = weekRow.createDiv({ cls: 'mt-day-cell' });
        dayCell.setCssProps({
          '--mt-grid-column': String(dayIndex + 2),
        });
        if (!day.isCurrentMonth) dayCell.addClass('mt-day-outside');
        const addTaskButton = dayCell.createEl('button', {
          cls: 'mt-day-add-button',
          text: '+',
          attr: {
            title: `在 ${day.isoDate} 新建任务`,
            'aria-label': `在 ${day.isoDate} 新建任务`,
          },
        });
        addTaskButton.addEventListener('click', (event) => {
          event.stopPropagation();
          this.openNewTaskModal(day.isoDate);
        });
        dayCell.addEventListener('dblclick', (event) => {
          const target = event.target;
          if (target instanceof Element && target.closest('button') !== null) return;
          this.openNewTaskModal(day.isoDate);
        });
        dayCell.createDiv({ cls: 'mt-day-number', text: String(day.date.getDate()) });

        const singleDayTasks = singleTasksByDate.get(day.isoDate) ?? [];
        const dayBarSegments = weekSegments.filter(
          (segment) => segment.startCol <= dayIndex && segment.endCol >= dayIndex,
        );
        const barTasks = dayBarSegments.map((segment) => segment.task);
        const dayLayout = layoutDayRows(
          dayBarSegments,
          singleDayTasks,
          MAX_VISIBLE_TASKS,
        );
        const allDayTasks = [...barTasks, ...singleDayTasks];
        const taskList = dayCell.createDiv({ cls: 'mt-day-task-list' });
        for (const placement of dayLayout.visibleSingleTasks) {
          const taskButton = this.renderTask(taskList, placement.task);
          taskButton.setCssProps({ '--mt-grid-row': String(placement.row + 1) });
        }

        if (dayLayout.hiddenCount > 0) {
          const moreButton = taskList.createEl('button', {
            cls: 'mt-more-button',
            text: `还有 ${dayLayout.hiddenCount} 个`,
          });
          moreButton.setCssProps({ '--mt-grid-row': String(MAX_VISIBLE_TASKS + 1) });
          moreButton.addEventListener('click', () => {
            new DayTasksModal(
              this.app,
              day.isoDate,
              allDayTasks,
              async (task) => this.openTask(task),
              async (task, done) => this.toggleTaskCompletion(task, done),
            ).open();
          });
        }
      }

      this.renderWeekBars(weekRow, weekSegments);
    }

    if (this.plugin.settings.pendingPanelVisible) {
      const backdrop = layout.createEl('button', {
        cls: 'mt-pending-backdrop',
        attr: {
          'aria-label': '关闭待安排栏',
          title: '关闭待安排栏',
        },
      });
      backdrop.addEventListener('click', () => {
        void this.setPendingPanelVisible(false);
      });
      this.renderPendingPanel(layout, pendingGroups);
    }
  }

  /** Persists and applies the pending panel's open state. */
  private async setPendingPanelVisible(visible: boolean): Promise<void> {
    this.plugin.settings.pendingPanelVisible = visible;
    await this.plugin.saveSettings();
    this.renderCalendar();
  }

  /** Draws grouped undated tasks without introducing a second action path. */
  private renderPendingPanel(
    layout: HTMLElement,
    groups: PendingTaskGroup[],
  ): void {
    const panel = layout.createEl('aside', {
      cls: 'mt-pending-panel',
    });
    panel.createDiv({ cls: 'mt-pending-panel-title', text: '待安排' });
    if (groups.length === 0) {
      panel.createDiv({ cls: 'mt-pending-empty', text: '没有待安排的任务' });
      return;
    }

    const collapsed = new Set(this.plugin.settings.pendingCollapsedGroups);
    for (const group of groups) {
      const section = panel.createDiv({ cls: 'mt-pending-group' });
      const isCollapsed = collapsed.has(group.key);
      const heading = section.createEl('button', {
        cls: 'mt-pending-group-heading',
        attr: {
          'aria-expanded': String(!isCollapsed),
          title: group.filePath,
        },
      });
      heading.createSpan({
        cls: 'mt-pending-group-arrow',
        text: isCollapsed ? '›' : '⌄',
      });
      heading.createSpan({ cls: 'mt-pending-group-name', text: group.label });
      heading.createSpan({
        cls: 'mt-pending-group-count',
        text: String(group.tasks.length),
      });
      heading.addEventListener('click', () => {
        void this.togglePendingGroup(group.key);
      });
      if (isCollapsed) continue;

      const list = section.createDiv({ cls: 'mt-pending-task-list' });
      for (const task of group.tasks) {
        const row = list.createDiv({ cls: 'mt-pending-task-row' });
        const checkbox = row.createEl('input', {
          cls: 'mt-pending-checkbox',
          attr: {
            type: 'checkbox',
            'aria-label': `标记完成：${task.title}`,
          },
        });
        checkbox.addEventListener('change', async () => {
          checkbox.disabled = true;
          const updated = await this.toggleTaskCompletion(task, checkbox.checked);
          if (!updated) {
            checkbox.checked = task.done;
            checkbox.disabled = false;
          }
        });

        const taskButton = row.createEl('button', {
          cls: 'mt-pending-task',
          attr: { title: `${task.title} · ${group.label}` },
        });
        taskButton.style.setProperty(
          '--mt-task-color',
          getTaskColor(task, this.plugin.settings),
        );
        taskButton.createSpan({ cls: 'mt-pending-task-title', text: task.title });
        this.renderTaskMarker(taskButton, task);
        taskButton.addEventListener('click', () => {
          void this.openPendingTask(task);
        });
        taskButton.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          this.showTaskMenu(event, task);
        });
      }
    }
  }

  /** Toggles one group's persisted collapse state. */
  private async togglePendingGroup(groupKey: string): Promise<void> {
    const collapsed = new Set(this.plugin.settings.pendingCollapsedGroups);
    if (collapsed.has(groupKey)) collapsed.delete(groupKey);
    else collapsed.add(groupKey);
    this.plugin.settings.pendingCollapsedGroups = [...collapsed];
    await this.plugin.saveSettings();
    this.renderCalendar();
  }

  /** Opens a pending task and closes the overlay variant on narrow views. */
  private async openPendingTask(task: Task): Promise<void> {
    if (this.contentEl.clientWidth < PENDING_DRAWER_BREAKPOINT) {
      this.plugin.settings.pendingPanelVisible = false;
      await this.plugin.saveSettings();
      this.renderCalendar();
    }
    await this.openTask(task);
  }

  /** Renders up to three week-bar lanes over the day cells. */
  private renderWeekBars(
    weekRow: HTMLElement,
    segments: WeekBarSegment[],
  ): void {
    if (segments.length === 0) return;
    const barLayer = weekRow.createDiv({ cls: 'mt-week-bars' });

    for (const segment of segments) {
      if (segment.lane >= MAX_VISIBLE_TASKS) continue;
      const classes = ['mt-week-bar'];
      if (segment.continuesLeft) classes.push('mt-week-bar-continues-left');
      if (segment.continuesRight) classes.push('mt-week-bar-continues-right');
      if (segment.task.done) classes.push('mt-task-done');
      const tooltip = `${segment.task.title} (${segment.task.start ?? ''} - ${segment.task.due ?? ''})`;
      const button = barLayer.createEl('button', {
        cls: classes.join(' '),
        attr: { title: tooltip },
      });
      button.style.setProperty(
        '--mt-task-color',
        getTaskColor(segment.task, this.plugin.settings),
      );
      button.setCssProps({
        '--mt-grid-column-start': String(segment.startCol + 1),
        '--mt-grid-column-end': String(segment.endCol + 2),
        '--mt-grid-row': String(segment.lane + 1),
      });
      if (segment.continuesLeft) {
        button.createSpan({ cls: 'mt-week-bar-arrow', text: '‹' });
      }
      button.createSpan({ cls: 'mt-week-bar-title', text: segment.task.title });
      this.renderTaskMarker(button, segment.task);
      if (segment.continuesRight) {
        button.createSpan({ cls: 'mt-week-bar-arrow', text: '›' });
      }
      button.addEventListener('click', () => {
        void this.openTask(segment.task);
      });
      button.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        this.showTaskMenu(event, segment.task);
      });
    }
  }

  /** Creates one top-bar button without imposing a fixed width. */
  private createToolbarButton(
    toolbar: HTMLElement,
    label: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const button = toolbar.createEl('button', { cls: 'mt-toolbar-button', text: label });
    button.addEventListener('click', onClick);
    return button;
  }

  /** Opens a fresh form that always starts from the configured default note. */
  private openNewTaskModal(initialDate: string): void {
    new NewTaskModal(
      this.app,
      initialDate,
      this.plugin.settings.newTaskDefaultNote,
      this.plugin.settings.scanFolder,
      async () => this.refreshTasks(),
    ).open();
  }

  /** Continuously scales calendar density while preserving a readable minimum. */
  private applyZoomStyles(): void {
    const scale = this.zoomPercent / 100;
    const setRem = (name: string, value: number, minimum: number): void => {
      this.contentEl.style.setProperty(name, `${Math.max(minimum, value * scale).toFixed(3)}rem`);
    };
    const setPx = (name: string, value: number, minimum: number): void => {
      this.contentEl.style.setProperty(name, `${Math.max(minimum, value * scale).toFixed(2)}px`);
    };
    setRem('--mt-week-column', 2.5, 1.5);
    setRem('--mt-cell-min-height', 7, 4.2);
    setPx('--mt-cell-padding', 4, 1);
    setPx('--mt-header-padding', 6, 2);
    setRem('--mt-task-font-size', 0.75, 0.55);
    setPx('--mt-task-padding', 4, 1);
    setRem('--mt-task-dot-size', 0.45, 0.3);
    setRem('--mt-day-header-height', 1.5, 1.05);
    setRem('--mt-content-row-height', 1.5, 1.05);
    setRem('--mt-pending-width', 15, 12);
    setPx('--mt-pending-gap', 6, 3);
    setPx('--mt-pending-padding', 8, 4);
  }

  /** Renders one single-day task with its configured card and optional marker colors. */
  private renderTask(container: HTMLElement, task: Task): HTMLButtonElement {
    const button = container.createEl('button', {
      cls: [
        'mt-task',
        task.done ? 'mt-task-done' : '',
      ].filter(Boolean).join(' '),
      attr: { title: task.title },
    });
    button.style.setProperty('--mt-task-color', getTaskColor(task, this.plugin.settings));
    button.createSpan({ cls: 'mt-task-title', text: task.title });
    this.renderTaskMarker(button, task);
    button.addEventListener('click', () => {
      void this.openTask(task);
    });
    button.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      this.showTaskMenu(event, task);
    });
    return button;
  }

  /** Shows the extensible task context menu before opening an action. */
  private showTaskMenu(event: MouseEvent, task: Task): void {
    const menu = new Menu();
    menu.addItem((item) => {
      item
        .setTitle('修改颜色')
        .setIcon('palette')
        .onClick(() => this.openTaskColorModal(task));
    });
    menu.addItem((item) => {
      item
        .setTitle('设置颜色标记')
        .setIcon('circle-dot')
        .onClick(() => this.openTaskMarkerColorModal(task));
    });
    menu.addItem((item) => {
      item
        .setTitle(task.done ? '标记为未完成' : '标记完成')
        .setIcon(task.done ? 'circle' : 'circle-check')
        .onClick(() => {
          void this.toggleTaskCompletion(task, !task.done);
        });
    });
    menu.showAtMouseEvent(event);
  }

  /** Opens the per-task color picker and persists its hidden line marker. */
  private openTaskColorModal(task: Task): void {
    const currentColor = getTaskColor(task, this.plugin.settings);
    new TaskColorModal(
      this.app,
      task.title,
      currentColor,
      getStoredTaskColor(task, this.plugin.settings.taskColors) !== undefined,
      this.plugin.settings.recentTaskColors,
      async (color) => this.saveTaskColor(task, color),
    ).open();
  }

  /** Saves a per-task color in plugin data without modifying the user's note. */
  private async saveTaskColor(task: Task, color: string | null): Promise<void> {
    try {
      this.plugin.settings.taskColors = updateStoredTaskColor(
        this.plugin.settings.taskColors,
        task,
        color,
      );
      if (color !== null) {
        this.plugin.settings.recentTaskColors = rememberRecentTaskColor(
          this.plugin.settings.recentTaskColors,
          color,
        );
      }
      await this.plugin.saveSettings();
    } catch (error) {
      console.error('Month Tasks failed to save task color:', error);
      new Notice('Month Tasks：保存颜色失败，请查看控制台');
      return;
    }
    this.plugin.refreshCalendarAppearance();
    new Notice(color === null ? 'Month Tasks：已恢复默认颜色' : 'Month Tasks：颜色已保存');
  }

  /** Opens the free-form marker picker without assigning meaning to any color. */
  private openTaskMarkerColorModal(task: Task): void {
    const stored = getStoredTaskColor(task, this.plugin.settings.taskMarkerColors);
    new TaskMarkerColorModal(
      this.app,
      task.title,
      stored ?? this.plugin.settings.recentTaskColors[0] ?? '#e5484d',
      stored !== undefined,
      this.plugin.settings.recentTaskColors,
      async (color) => this.saveTaskMarkerColor(task, color),
    ).open();
  }

  /** Saves a free-form marker color in plugin data without modifying the task line. */
  private async saveTaskMarkerColor(task: Task, color: string | null): Promise<void> {
    this.plugin.settings.taskMarkerColors = updateStoredTaskColor(
      this.plugin.settings.taskMarkerColors,
      task,
      color,
    );
    if (color !== null) {
      this.plugin.settings.recentTaskColors = rememberRecentTaskColor(
        this.plugin.settings.recentTaskColors,
        color,
      );
    }
    await this.plugin.saveSettings();
    this.plugin.refreshCalendarAppearance();
    new Notice(color === null ? 'Month Tasks：已移除颜色标记' : 'Month Tasks：颜色标记已保存');
  }

  /** Draws only markers explicitly chosen by the user. */
  private renderTaskMarker(container: HTMLElement, task: Task): void {
    if (!this.plugin.settings.showTaskMarkers) return;
    const color = getStoredTaskColor(task, this.plugin.settings.taskMarkerColors);
    if (color === undefined) return;
    const dot = container.createSpan({
      cls: 'mt-task-marker-dot',
      attr: { title: `颜色标记 ${color}`, 'aria-label': `颜色标记 ${color}` },
    });
    dot.style.setProperty('--mt-marker-color', color);
  }

  /** Safely toggles only the checkbox after confirming the scanned source line. */
  private async toggleTaskCompletion(task: Task, done: boolean): Promise<boolean> {
    const file = this.app.vault.getAbstractFileByPath(task.filePath);
    if (!(file instanceof TFile)) {
      new Notice(`Month Tasks：找不到笔记 ${task.filePath}`);
      return false;
    }

    let updated = false;
    let sourceChanged = false;
    try {
      await this.app.vault.process(file, (content) => {
        const result = updateTaskCompletionInContent(content, task, done);
        updated = result.updated;
        sourceChanged = result.failure === 'source-changed';
        return result.content;
      });
    } catch (error) {
      console.error('Month Tasks failed to toggle task completion:', error);
      new Notice('Month Tasks：更新任务状态失败，请查看控制台');
      return false;
    }

    if (!updated) {
      new Notice(sourceChanged
        ? 'Month Tasks：任务内容已变化，为避免误写，未更新状态'
        : 'Month Tasks：无法识别任务复选框，未更新状态');
      return false;
    }
    const nextRawLine = setTaskLineCompletion(task.rawLine, done);
    if (nextRawLine !== null) task.rawLine = nextRawLine;
    task.done = done;
    await this.refreshTasks();
    new Notice(done ? 'Month Tasks：已标记完成' : 'Month Tasks：已标记为未完成');
    return true;
  }

  /** Opens the source note in a new tab and requests the original task line. */
  private async openTask(task: Task): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(task.filePath);
    if (!(file instanceof TFile)) {
      new Notice(`Month Tasks：找不到笔记 ${task.filePath}`);
      return;
    }

    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.openFile(file, {
      active: true,
      eState: { line: task.line },
    });
  }
}
