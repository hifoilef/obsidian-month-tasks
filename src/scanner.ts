import type { App } from 'obsidian';
import { parseFile, type Task } from './parser';
import { isPathInScanFolder } from './scan-scope';
import type { MonthTasksSettings } from './settings';

export interface VaultScanResult {
  tasks: Task[];
  /** Every Markdown file currently known to the vault, including files outside the scan scope. */
  existingFilePaths: string[];
  /** In-scope files whose contents were read and parsed successfully. */
  successfulFilePaths: string[];
  hadReadFailures: boolean;
}

export type VaultReadFailureHandler = (filePath: string, error: unknown) => void;

/** Keeps only the last successful per-file result for temporary read-failure fallback. */
export class VaultTaskScanner {
  private readonly lastSuccessfulTasks = new Map<string, Task[]>();
  private readonly notifiedFailures = new Set<string>();

  constructor(private readonly onReadFailure?: VaultReadFailureHandler) {}

  async scan(app: App, settings: MonthTasksSettings): Promise<VaultScanResult> {
    const scanFolder = settings.scanFolder.trim().replace(/^\/+|\/+$/gu, '');
    const markdownFiles = app.vault.getMarkdownFiles();
    const files = markdownFiles.filter((file) => isPathInScanFolder(file.path, scanFolder));
    const activePaths = new Set(files.map((file) => file.path));
    const successfulFilePaths: string[] = [];
    let hadReadFailures = false;

    for (const cachedPath of this.lastSuccessfulTasks.keys()) {
      if (!activePaths.has(cachedPath)) this.lastSuccessfulTasks.delete(cachedPath);
    }

    const tasksByFile = await Promise.all(files.map(async (file) => {
      try {
        const tasks = parseFile(file.path, await app.vault.cachedRead(file));
        this.lastSuccessfulTasks.set(file.path, tasks);
        successfulFilePaths.push(file.path);
        this.notifiedFailures.delete(file.path);
        return tasks;
      } catch (error) {
        hadReadFailures = true;
        if (!this.notifiedFailures.has(file.path)) {
          this.notifiedFailures.add(file.path);
          this.onReadFailure?.(file.path, error);
        }
        return this.lastSuccessfulTasks.get(file.path) ?? [];
      }
    }));

    return {
      tasks: tasksByFile.flat(),
      existingFilePaths: markdownFiles.map((file) => file.path),
      successfulFilePaths,
      hadReadFailures,
    };
  }
}

/** Reads a complete scan report so persisted task metadata can be cleaned conservatively. */
export async function scanVaultWithReport(
  app: App,
  settings: MonthTasksSettings,
): Promise<VaultScanResult> {
  return new VaultTaskScanner().scan(app, settings);
}

/** Reads Markdown files from the selected vault scope and parses their tasks. */
export async function scanVault(
  app: App,
  settings: MonthTasksSettings,
): Promise<Task[]> {
  return (await scanVaultWithReport(app, settings)).tasks;
}
