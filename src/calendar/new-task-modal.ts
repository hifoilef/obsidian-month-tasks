import {
  App,
  FuzzySuggestModal,
  Modal,
  Setting,
  TFile,
} from 'obsidian';
import {
  addDaysToIsoDate,
  buildTaskLine,
  validateNewTask,
  type NewTaskDraft,
} from '../new-task';
import {
  appendTaskLineToNote,
  getNewTaskNoteCandidates,
  getNewTaskTargetError,
} from '../new-task-note';

type NewTaskMode = 'single' | 'range';

/** Obsidian-native fuzzy picker restricted to already validated ordinary notes. */
class NewTaskNoteSuggestModal extends FuzzySuggestModal<TFile> {
  constructor(
    app: App,
    private readonly files: TFile[],
    private readonly choose: (file: TFile) => void,
  ) {
    super(app);
    this.setPlaceholder('搜索普通 Markdown 笔记');
  }

  override getItems(): TFile[] {
    return this.files;
  }

  override getItemText(file: TFile): string {
    return file.path;
  }

  override onChooseItem(file: TFile): void {
    this.choose(file);
  }
}

/** Creates one task in a user-visible Markdown note without extra metadata. */
export class NewTaskModal extends Modal {
  private titleValue = '';
  private mode: NewTaskMode = 'single';
  private singleDate: string;
  private startDate: string;
  private endDate: string;
  private targetPath: string;
  private messageEl: HTMLElement | undefined;
  private singleDateSetting: Setting | undefined;
  private startDateSetting: Setting | undefined;
  private endDateSetting: Setting | undefined;
  private targetButtonEl: HTMLButtonElement | undefined;
  private saveButtonEl: HTMLButtonElement | undefined;
  private focusTimer: number | undefined;

  constructor(
    app: App,
    initialDate: string,
    defaultNotePath: string,
    private readonly scanFolder: string,
    private readonly onSaved: () => Promise<void>,
  ) {
    super(app);
    this.singleDate = initialDate;
    this.startDate = initialDate;
    this.endDate = addDaysToIsoDate(initialDate, 1) ?? initialDate;
    this.targetPath = defaultNotePath;
  }

  override onOpen(): void {
    this.modalEl.addClass('mt-new-task-modal');
    this.setTitle('新建任务');

    const titleSetting = new Setting(this.contentEl)
      .setName('任务标题')
      .addText((text) => {
        text
          .setPlaceholder('输入任务标题')
          .onChange((value) => {
            this.titleValue = value;
            this.clearError();
          });
        text.inputEl.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter' || event.isComposing) return;
          event.preventDefault();
          void this.save();
        });
        this.focusTimer = window.setTimeout(() => {
          this.focusTimer = undefined;
          text.inputEl.focus();
        }, 0);
      });
    titleSetting.setClass('mt-new-task-title-setting');

    new Setting(this.contentEl)
      .setName('类型')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('single', '单日截止')
          .addOption('range', '持续时间')
          .setValue(this.mode)
          .onChange((value) => {
            this.mode = value === 'range' ? 'range' : 'single';
            this.updateDateVisibility();
            this.updateSameDayMessage();
          }),
      );

    this.singleDateSetting = new Setting(this.contentEl)
      .setName('截止日期')
      .addText((text) => {
        text.inputEl.type = 'date';
        text.setValue(this.singleDate).onChange((value) => {
          this.singleDate = value;
          this.clearError();
        });
      });
    this.startDateSetting = new Setting(this.contentEl)
      .setName('开始日期')
      .addText((text) => {
        text.inputEl.type = 'date';
        text.setValue(this.startDate).onChange((value) => {
          this.startDate = value;
          this.updateSameDayMessage();
        });
      });
    this.endDateSetting = new Setting(this.contentEl)
      .setName('结束日期')
      .addText((text) => {
        text.inputEl.type = 'date';
        text.setValue(this.endDate).onChange((value) => {
          this.endDate = value;
          this.updateSameDayMessage();
        });
      });
    this.updateDateVisibility();

    new Setting(this.contentEl)
      .setName('保存到')
      .setDesc('每次打开都使用设置中的默认笔记。')
      .addButton((button) => {
        this.targetButtonEl = button.buttonEl;
        button
          .setButtonText(this.getTargetLabel())
          .setTooltip(this.targetPath)
          .onClick(() => void this.openNotePicker());
      });

    this.messageEl = this.contentEl.createDiv({
      cls: 'mt-new-task-message',
      attr: { 'aria-live': 'polite' },
    });

    const actions = this.contentEl.createDiv({ cls: 'mt-new-task-actions' });
    const cancelButton = actions.createEl('button', { text: '取消' });
    cancelButton.addEventListener('click', () => this.close());
    this.saveButtonEl = actions.createEl('button', {
      cls: 'mod-cta',
      text: '保存',
    });
    this.saveButtonEl.addEventListener('click', () => void this.save());
  }

  override onClose(): void {
    if (this.focusTimer !== undefined) window.clearTimeout(this.focusTimer);
    this.focusTimer = undefined;
    this.modalEl.removeClass('mt-new-task-modal');
    this.contentEl.empty();
  }

  private updateDateVisibility(): void {
    this.singleDateSetting?.settingEl.toggleClass('mt-is-hidden', this.mode !== 'single');
    this.startDateSetting?.settingEl.toggleClass('mt-is-hidden', this.mode !== 'range');
    this.endDateSetting?.settingEl.toggleClass('mt-is-hidden', this.mode !== 'range');
  }

  private updateSameDayMessage(): void {
    if (this.mode === 'range' && this.startDate !== '' && this.startDate === this.endDate) {
      this.showMessage('开始与结束同一天，将按单日任务保存。', false);
    } else {
      this.clearError();
    }
  }

  private getTargetLabel(): string {
    const fileName = this.targetPath.split('/').at(-1) ?? this.targetPath;
    return fileName.replace(/\.md$/iu, '') || '选择笔记';
  }

  private async openNotePicker(): Promise<void> {
    this.clearError();
    const files = await getNewTaskNoteCandidates(this.app, this.scanFolder);
    if (files.length === 0) {
      this.showMessage('当前扫描范围内没有可选择的普通 Markdown 笔记。', true);
      return;
    }
    new NewTaskNoteSuggestModal(this.app, files, (file) => {
      this.targetPath = file.path;
      this.targetButtonEl?.setText(this.getTargetLabel());
      this.targetButtonEl?.setAttribute('aria-label', `保存到 ${file.path}`);
      this.targetButtonEl?.setAttribute('title', file.path);
      this.clearError();
    }).open();
  }

  private getDraft(): NewTaskDraft {
    return this.mode === 'single'
      ? { title: this.titleValue, due: this.singleDate }
      : { title: this.titleValue, start: this.startDate, due: this.endDate };
  }

  private async save(): Promise<void> {
    const validation = validateNewTask(this.getDraft());
    if (!validation.ok) {
      this.showMessage(validation.error, true);
      return;
    }
    const targetError = await getNewTaskTargetError(
      this.app,
      this.targetPath,
      this.scanFolder,
    );
    if (targetError !== null) {
      this.showMessage(targetError, true);
      return;
    }

    this.saveButtonEl?.setAttribute('disabled', 'true');
    try {
      await appendTaskLineToNote(
        this.app,
        this.targetPath,
        this.scanFolder,
        buildTaskLine(validation.value),
      );
      await this.onSaved();
      this.close();
    } catch (error) {
      const reason = error instanceof Error ? error.message : '未知错误';
      this.showMessage(`保存失败：${reason}`, true);
      this.saveButtonEl?.removeAttribute('disabled');
    }
  }

  private clearError(): void {
    if (this.messageEl?.hasClass('is-error') ?? false) this.showMessage('', false);
  }

  private showMessage(message: string, isError: boolean): void {
    if (this.messageEl === undefined) return;
    this.messageEl.setText(message);
    this.messageEl.toggleClass('is-error', isError);
    this.messageEl.toggleClass('is-info', message !== '' && !isError);
  }
}
