import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const outputRoot = path.join(import.meta.dirname, '.generated-performance-vault');
const noteCount = 300;
const taskCount = 2_000;

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

let generatedTasks = 0;
for (let noteIndex = 0; noteIndex < noteCount; noteIndex += 1) {
  const tasksInNote = Math.floor(taskCount / noteCount)
    + (noteIndex < taskCount % noteCount ? 1 : 0);
  const folder = path.join(outputRoot, `folder-${String(noteIndex % 12).padStart(2, '0')}`);
  await mkdir(folder, { recursive: true });

  const lines = noteIndex === 0
    ? ['---', 'kanban-plugin: basic', '---', '', '## 合成待办']
    : [`# 合成笔记 ${noteIndex}`, ''];

  for (let taskIndex = 0; taskIndex < tasksInNote; taskIndex += 1) {
    const serial = generatedTasks + 1;
    const day = String((serial % 28) + 1).padStart(2, '0');
    const nextDay = String(((serial + 2) % 28) + 1).padStart(2, '0');
    switch (serial % 4) {
      case 0:
        lines.push(`- [ ] 无日期任务 ${serial}`);
        break;
      case 1:
        lines.push(`- [ ] 截止任务 ${serial} 📅 2026-10-${day}`);
        break;
      case 2:
        lines.push(`- [ ] 跨天任务 ${serial} ⏳ 2026-10-${day} 📅 2026-11-${nextDay}`);
        break;
      default:
        lines.push(`- [x] 已完成任务 ${serial} 📅 2026-09-${day}`);
        break;
    }
    generatedTasks += 1;
  }

  if (noteIndex === 0) {
    lines.push('', '***', '', '## Archive', '- [ ] 此归档任务不应被解析', '', '%% kanban:settings', '{}', '%%');
  }
  const fileName = noteIndex === 0 ? 'kanban-sample.md' : `note-${String(noteIndex).padStart(3, '0')}.md`;
  await writeFile(path.join(folder, fileName), `${lines.join('\n')}\n`, 'utf8');
}

console.log(JSON.stringify({
  output: path.relative(projectRoot, outputRoot),
  notes: noteCount,
  tasks: generatedTasks,
}, null, 2));
