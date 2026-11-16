import { App, Modal } from 'obsidian';
import type { Task } from '../parser';
import { isMultiDayTask } from './layout-week-bars';
import { getUpcomingGroupLabel, type UpcomingTask } from './upcoming';

/** Lists overdue and next-seven-day tasks with direct completion controls. */
export class UpcomingTasksModal extends Modal {
  constructor(
    app: App,
    private readonly items: UpcomingTask[],
    private readonly upcomingLabel: string,
    private readonly includeOverdue: boolean,
    private readonly openTask: (task: Task) => Promise<void>,
    private readonly toggleTask: (task: Task, done: boolean) => Promise<boolean>,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.modalEl.addClass('mt-upcoming-modal');
    this.setTitle(this.includeOverdue
      ? `${this.upcomingLabel}与逾期任务`
      : `${this.upcomingLabel}任务`);
    const list = this.contentEl.createDiv({ cls: 'mt-upcoming-list' });

    if (this.items.length === 0) {
      list.createDiv({
        cls: 'mt-upcoming-empty',
        text: this.includeOverdue
          ? `目前没有逾期或${this.upcomingLabel}到期的任务。`
          : `目前没有${this.upcomingLabel}到期的任务。`,
      });
      return;
    }

    for (const item of this.items) {
      const row = list.createDiv({
        cls: `mt-upcoming-item${item.overdue ? ' is-overdue' : ''}`,
      });
      const checkbox = row.createEl('input', {
        cls: 'mt-upcoming-checkbox',
        attr: { type: 'checkbox', 'aria-label': `标记完成：${item.task.title}` },
      });
      checkbox.checked = item.task.done;
      checkbox.addEventListener('change', () => {
        void this.handleToggle(item, checkbox, row);
      });

      const button = row.createEl('button', { cls: 'mt-upcoming-task' });
      button.createDiv({ cls: 'mt-upcoming-title', text: item.task.title });
      const dateText = isMultiDayTask(item.task)
        ? `${item.task.start} – ${item.task.due}`
        : item.deadline;
      const groupLabel = getUpcomingGroupLabel(item.task);
      button.createDiv({
        cls: 'mt-upcoming-meta',
        text: groupLabel === null ? dateText : `${dateText} · ${groupLabel}`,
      });
      button.addEventListener('click', () => {
        this.close();
        void this.openTask(item.task);
      });
    }
  }

  override onClose(): void {
    this.modalEl.removeClass('mt-upcoming-modal');
    this.contentEl.empty();
  }

  private async handleToggle(
    item: UpcomingTask,
    checkbox: HTMLInputElement,
    row: HTMLElement,
  ): Promise<void> {
    checkbox.disabled = true;
    const updated = await this.toggleTask(item.task, checkbox.checked);
    if (updated) {
      item.task.done = checkbox.checked;
      row.classList.toggle('mt-task-done', item.task.done);
      row.classList.toggle('is-overdue', item.overdue && !item.task.done);
    } else {
      checkbox.checked = item.task.done;
    }
    checkbox.disabled = false;
  }
}
