import { App, Modal, Notice, Setting, type ColorComponent } from 'obsidian';
import { getTaskColorPalette, normalizeHexColor } from '../task-color';
import { getEyeDropperConstructor } from '../eye-dropper';

/** Lets the user assign a free-form colored marker without giving it a fixed meaning. */
export class TaskMarkerColorModal extends Modal {
  private selectedColor: string;

  constructor(
    app: App,
    private readonly taskTitle: string,
    initialColor: string,
    private readonly hasMarker: boolean,
    private readonly recentColors: string[],
    private readonly saveColor: (color: string | null) => Promise<void>,
  ) {
    super(app);
    this.selectedColor = initialColor;
  }

  override onOpen(): void {
    this.modalEl.addClass('mt-color-modal');
    this.setTitle('设置任务标记');
    const preview = this.contentEl.createDiv({ cls: 'mt-marker-color-preview' });
    const previewDot = preview.createSpan({ cls: 'mt-marker-color-preview-dot' });
    previewDot.style.setProperty('--mt-marker-preview-color', this.selectedColor);
    preview.createSpan({ text: this.taskTitle });

    let picker: ColorComponent | null = null;
    const swatchButtons: Array<{ color: string; button: HTMLButtonElement }> = [];
    const selectColor = (value: string): void => {
      const color = normalizeHexColor(value);
      if (color === null) return;
      this.selectedColor = color;
      previewDot.style.setProperty('--mt-marker-preview-color', color);
      picker?.setValue(color);
      for (const item of swatchButtons) {
        const selected = item.color === color;
        item.button.classList.toggle('is-selected', selected);
        item.button.setAttribute('aria-pressed', String(selected));
      }
    };

    const colorSetting = new Setting(this.contentEl)
      .setName('标记颜色')
      .addColorPicker((component) => {
        picker = component;
        component.setValue(this.selectedColor).onChange(selectColor);
      });

    const EyeDropper = getEyeDropperConstructor(window);
    if (EyeDropper !== undefined) {
      colorSetting.addButton((button) => {
        button
          .setIcon('pipette')
          .setTooltip('从屏幕取色')
          .onClick(async () => {
            try {
              const result = await new EyeDropper().open();
              selectColor(result.sRGBHex);
            } catch (error) {
              if (!(error instanceof DOMException && error.name === 'AbortError')) {
                console.error('Month Tasks eyedropper failed:', error);
                new Notice('屏幕取色失败');
              }
            }
          });
      });
    }

    const palette = this.contentEl.createDiv({ cls: 'mt-color-history' });
    palette.createDiv({ cls: 'mt-color-history-label', text: '常用颜色' });
    const swatches = palette.createDiv({ cls: 'mt-color-history-swatches' });
    for (const color of getTaskColorPalette(this.recentColors)) {
      const swatch = swatches.createEl('button', {
        cls: 'mt-color-history-swatch',
        attr: {
          type: 'button',
          title: `使用 ${color}`,
          'aria-label': `使用颜色 ${color}`,
          'aria-pressed': String(color === this.selectedColor),
        },
      });
      swatch.style.setProperty('--mt-history-color', color);
      swatch.classList.toggle('is-selected', color === this.selectedColor);
      swatch.addEventListener('click', () => selectColor(color));
      swatchButtons.push({ color, button: swatch });
    }

    new Setting(this.contentEl)
      .addButton((button) => {
        button
          .setButtonText('移除标记')
          .setDisabled(!this.hasMarker)
          .onClick(async () => {
            await this.saveColor(null);
            this.close();
          });
      })
      .addButton((button) => {
        button
          .setButtonText('保存')
          .setCta()
          .onClick(async () => {
            await this.saveColor(this.selectedColor);
            this.close();
          });
      });
  }

  override onClose(): void {
    this.modalEl.removeClass('mt-color-modal');
    this.contentEl.empty();
  }
}
