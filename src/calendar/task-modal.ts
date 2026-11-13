import { App, Modal } from 'obsidian';
import type { Task } from '../parser';

/** Lists every task assigned to one calendar day. */
export class DayTasksModal extends Modal {
  constructor(
    app: App,
    private readonly dateLabel: string,
    private readonly tasks: Task[],
    private readonly openTask: (task: Task) => Promise<void>,
    private readonly toggleTask: (task: Task, done: boolean) => Promise<boolean>,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.setTitle(`${this.dateLabel} 的任务`);
    const list = this.contentEl.createDiv({ cls: 'mt-modal-task-list' });

    for (const task of this.tasks) {
      const row = list.createDiv({ cls: 'mt-modal-task-row' });
      const checkbox = row.createEl('input', {
        cls: 'mt-modal-task-checkbox',
        attr: { type: 'checkbox', 'aria-label': `切换 ${task.title} 的完成状态` },
      });
      checkbox.checked = task.done;
      checkbox.addEventListener('change', async () => {
        checkbox.disabled = true;
        const updated = await this.toggleTask(task, checkbox.checked);
        if (updated) {
          task.done = checkbox.checked;
          button.classList.toggle('mt-task-done', task.done);
          checkbox.disabled = false;
        } else {
          checkbox.checked = task.done;
          checkbox.disabled = false;
        }
      });
      const button = row.createEl('button', {
        cls: `mt-modal-task${task.done ? ' mt-task-done' : ''}`,
        text: task.title,
      });
      button.addEventListener('click', () => {
        this.close();
        void this.openTask(task);
      });
    }
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}
