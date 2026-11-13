/** Normalizes a vault-relative path without depending on Obsidian APIs. */
export function normalizeVaultPath(path: string): string {
  return path.trim().replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '').replace(/\/{2,}/gu, '/');
}

/** Checks whether a vault-relative file path is inside the configured scan folder. */
export function isPathInScanFolder(path: string, scanFolder: string): boolean {
  const normalizedPath = normalizeVaultPath(path);
  const normalizedFolder = normalizeVaultPath(scanFolder);
  if (normalizedFolder === '') return true;
  return normalizedPath === normalizedFolder
    || normalizedPath.startsWith(`${normalizedFolder}/`);
}
