import { describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { DEFAULT_SETTINGS } from '../src/settings-data';
import { VaultTaskScanner } from '../src/scanner';

function fakeApp(contents: Record<string, string | Error>): App {
  const files = Object.keys(contents).map((path) => ({ path }));
  return {
    vault: {
      getMarkdownFiles: () => files,
      cachedRead: async (file: { path: string }) => {
        const value = contents[file.path];
        if (value instanceof Error) throw value;
        return value;
      },
    },
  } as unknown as App;
}

describe('fault-tolerant vault scanning', () => {
  it('keeps readable files and omits a never-successful failed file', async () => {
    const onFailure = vi.fn();
    const scanner = new VaultTaskScanner(onFailure);
    const scan = await scanner.scan(fakeApp({
      'Good.md': '- [ ] 正常任务 📅 2026-10-20',
      'Bad.md': new Error('locked'),
    }), DEFAULT_SETTINGS);

    expect(scan.tasks.map((task) => task.title)).toEqual(['正常任务']);
    expect(scan.successfulFilePaths).toEqual(['Good.md']);
    expect(scan.hadReadFailures).toBe(true);
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it('reuses the last successful tasks and reports one notice per failure episode', async () => {
    const onFailure = vi.fn();
    const scanner = new VaultTaskScanner(onFailure);
    const initial = await scanner.scan(fakeApp({
      'Tasks.md': '- [ ] 旧任务 📅 2026-10-20',
    }), DEFAULT_SETTINGS);
    expect(initial.tasks[0]?.title).toBe('旧任务');

    const failedApp = fakeApp({ 'Tasks.md': new Error('locked') });
    const firstFailure = await scanner.scan(failedApp, DEFAULT_SETTINGS);
    const repeatedFailure = await scanner.scan(failedApp, DEFAULT_SETTINGS);
    expect(firstFailure.tasks[0]?.title).toBe('旧任务');
    expect(repeatedFailure.tasks[0]?.title).toBe('旧任务');
    expect(firstFailure.hadReadFailures).toBe(true);
    expect(onFailure).toHaveBeenCalledTimes(1);

    const recovered = await scanner.scan(fakeApp({
      'Tasks.md': '- [ ] 新任务 📅 2026-10-21',
    }), DEFAULT_SETTINGS);
    expect(recovered.tasks[0]?.title).toBe('新任务');
    expect(recovered.hadReadFailures).toBe(false);

    await scanner.scan(failedApp, DEFAULT_SETTINGS);
    expect(onFailure).toHaveBeenCalledTimes(2);
  });
});
