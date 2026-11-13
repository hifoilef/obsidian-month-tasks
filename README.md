# Month Tasks

## English

Month Tasks displays Markdown checkbox tasks in a monthly calendar inside Obsidian. It works independently and does not require the Kanban or Tasks plugins. Version 0.1 has been verified on the desktop app and is marked as desktop-only.

### Features

- Shows single-day tasks and multi-day task bars in a monthly calendar.
- Collects unfinished tasks without dates in a collapsible pending-tasks panel, grouped by source note.
- Supports custom task colors and an independent, user-defined color marker.
- Creates tasks from the calendar and safely toggles `[ ]` and `[x]` after checking the original line.
- Provides configurable upcoming and overdue summaries and calendar zoom from 60% to 130%.
- Reads existing Kanban notes without depending on Kanban columns or modifying the board.

### Installation

To install with BRAT, add this repository:

```text
https://github.com/hifoilef/obsidian-month-tasks
```

For a manual installation, download `main.js`, `manifest.json`, and `styles.css` from the latest GitHub release. Put them in `<vault>/.obsidian/plugins/month-tasks/`, reload Obsidian, and enable **Month Tasks** under Community plugins.

### Supported task syntax

Month Tasks recognizes unordered Markdown checkbox tasks with optional scheduled and due dates:

```markdown
- [ ] Single-day task 📅 2026-10-20
- [ ] Multi-day task ⏳ 2026-10-20 📅 2026-10-25
- [x] Completed task 📅 2026-10-18
```

`📅 YYYY-MM-DD` is the due date and `⏳ YYYY-MM-DD` is the start date. Dates written as ordinary title text are not parsed. Custom task states such as `[/]` and `[-]`, block quotes, and ordered-list tasks are not supported.

### Data and privacy

The plugin does not make network requests or collect data. It only modifies notes when appending a newly created task or toggling a checkbox between `[ ]` and `[x]`; the original line is validated before every checkbox write. Task colors, marker colors, panel state, and settings are stored locally in the plugin's `data.json` file. Sync the plugin directory as well as your notes if you want those settings on another device.

### Known limitations

- Renaming a task can remove its saved task color and marker color.
- Reordering duplicate task titles in the same note can associate a saved color with a different duplicate.
- Moving an individual task to another note does not preserve its colors; renaming or moving the entire note does.
- Version 0.1 is currently verified on desktop only.

## 中文

Month Tasks 是一个面向 Markdown 复选框任务的 Obsidian 月历插件。它可以独立运行，
不要求安装 Kanban 或 Tasks 插件。v0.1 当前仅在桌面端完成验证，并标记为仅桌面端。

## 安装

### 手动安装

1. 在仓库中执行 `npm install` 和 `npm run build`。
2. 将 `main.js`、`manifest.json`、`styles.css` 复制到
   `<你的库>/.obsidian/plugins/month-tasks/`。
3. 重新加载 Obsidian，在「第三方插件」中启用 Month Tasks。

### BRAT

在 BRAT 中添加仓库 `https://github.com/hifoilef/obsidian-month-tasks`，即可安装 Month Tasks。

## 任务语法

插件只读取无序列表中的复选框任务，推荐使用以下格式：

```markdown
- [ ] 单日任务 📅 2026-10-20
- [ ] 持续任务 ⏳ 2026-10-20 📅 2026-10-25
- [x] 已完成任务 📅 2026-10-18
```

- `📅 YYYY-MM-DD` 是截止日期。
- `⏳ YYYY-MM-DD` 是开始日期；同时存在开始和截止日期时显示为跨天任务。
- 标题里的普通日期文字不会被识别，例如「课程A6.14」没有任务日期。
- 不支持 `[/]`、`[-]` 等自定义状态，也不识别引用块和有序列表中的任务。
- 插件不会写入 `✅` 完成日期。

## 新建与修改任务

可以从月历顶栏、日期格右上角的「+」或双击日期格空白处新建任务。默认目标是
`Month Tasks/任务收集.md`，可在设置中改为扫描范围内的其他普通 Markdown 笔记。

插件只会在两种操作中修改笔记：

1. 新建任务时，通过 Obsidian 的原子写入接口在目标笔记末尾追加一行。
2. 切换完成状态时，在确认原始任务行没有被外部修改后切换 `[ ]` 与 `[x]`。

建议首次使用前备份笔记。插件不联网，也不收集或上传任何数据。

## Kanban 兼容

Month Tasks 完全独立于 Kanban。已有 Kanban 文件仅作为只读任务来源；插件不会向看板
写入任务，也不依赖看板列。Kanban 文件中 `***` 之后的归档区会被忽略。

## 卡片颜色与圆点标记

- 卡片颜色可以作为你的任务分类。
- 圆点标记是由你自由定义的第二个维度；插件不会自动根据日期生成圆点。
- 两套颜色相互独立，都保存在插件目录的 `data.json` 中，不会写进笔记正文。
- 若换设备时希望保留颜色，需要同时同步 `.obsidian/plugins/month-tasks/data.json`。
- 颜色记录在确认任务消失后会保留 14 天，避免同步或临时读取问题造成误删。

## 汇总、待安排栏与缩放

- 顶栏汇总显示今天到未来 N 天的未完成任务；范围可在设置中调整。
- 「显示逾期任务」只控制顶栏汇总和汇总弹窗，不影响月历中的过去任务。全新安装默认关闭。
- 「逾期回溯范围」只限制汇总向前包含多少天的逾期任务。
- 待安排栏收集扫描范围内没有开始日期和截止日期、且尚未完成的任务，并按来源笔记分组。
- 月历可在 60%～130% 间连续缩放，顶栏和设置页中的数值会同步保存。

## 已知限制

- 修改任务标题后，该任务的卡片颜色和圆点标记会丢失。
- 同一文件中同名任务的出现顺序改变后，颜色可能对应到另一条同名任务。
- 把任务移动到另一篇笔记后，颜色不会跟随；重命名或移动整篇笔记时颜色会跟随。
- 只同步 Markdown 笔记不会带走颜色数据；还需要同步插件目录中的 `data.json`。

## 开发与测试库部署

```bash
npm install
npm test
npm run build
```

将 `deploy.config.example.json` 复制为已被 Git 忽略的 `deploy.config.json`，填写测试库的
`vaultPath`，然后运行 `npm run deploy`。命令面板中的「Month Tasks: 打印解析结果」可将
扫描结果输出到开发者控制台。
