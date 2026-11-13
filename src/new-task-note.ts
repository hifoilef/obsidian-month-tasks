import { App, TFile, TFolder, normalizePath } from 'obsidian';
import { hasKanbanFrontmatter } from './parser';
import {
  appendTaskToContent,
  filterNewTaskNoteCandidates,
  validateNewTaskTargetPath,
} from './new-task';
import { normalizeVaultPath } from './scan-scope';

/** Returns a Chinese reason when a target cannot safely receive new tasks. */
export async function getNewTaskTargetError(
  app: App,
  targetPath: string,
  scanFolder: string,
): Promise<string | null> {
  const normalizedPath = normalizeVaultPath(targetPath);
  const pathError = validateNewTaskTargetPath(normalizedPath, scanFolder);
  if (pathError !== null) return pathError;

  const existing = app.vault.getAbstractFileByPath(normalizedPath);
  if (existing === null) return null;
  if (!(existing instanceof TFile)) return '新任务目标路径不是 Markdown 文件。';
  const content = await app.vault.cachedRead(existing);
  if (hasKanbanFrontmatter(content.split(/\r?\n/u))) {
    return '新任务不能写入 Kanban 看板，请选择普通 Markdown 笔记。';
  }
  return null;
}

/** Loads picker candidates once, excluding Kanban and out-of-scope notes. */
export async function getNewTaskNoteCandidates(
  app: App,
  scanFolder: string,
): Promise<TFile[]> {
  const files = app.vault.getMarkdownFiles();
  const candidates = await Promise.all(files.map(async (file) => ({
    path: file.path,
    content: await app.vault.cachedRead(file),
  })));
  const allowedPaths = new Set(
    filterNewTaskNoteCandidates(candidates, scanFolder).map((candidate) => candidate.path),
  );
  return files.filter((file) => allowedPaths.has(file.path));
}

/** Creates each missing parent folder without replacing existing vault entries. */
async function ensureParentFolders(app: App, filePath: string): Promise<void> {
  const parts = normalizePath(filePath).split('/');
  parts.pop();
  let current = '';
  for (const part of parts) {
    current = current === '' ? part : `${current}/${part}`;
    const existing = app.vault.getAbstractFileByPath(current);
    if (existing instanceof TFolder) continue;
    if (existing !== null) throw new Error(`路径 ${current} 已被文件占用`);
    await app.vault.createFolder(current);
  }
}

/** Creates a missing ordinary note or atomically appends to an existing one. */
export async function appendTaskLineToNote(
  app: App,
  targetPath: string,
  scanFolder: string,
  line: string,
): Promise<TFile> {
  const normalizedPath = normalizeVaultPath(targetPath);
  const targetError = await getNewTaskTargetError(app, normalizedPath, scanFolder);
  if (targetError !== null) throw new Error(targetError);

  const existing = app.vault.getAbstractFileByPath(normalizedPath);
  if (existing instanceof TFile) {
    await app.vault.process(existing, (content) => appendTaskToContent(content, line));
    return existing;
  }

  await ensureParentFolders(app, normalizedPath);
  return app.vault.create(normalizedPath, `${line}\n`);
}
