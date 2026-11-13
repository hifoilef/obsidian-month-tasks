export interface SafePluginDataLoadResult {
  data: unknown;
  recoveredFromCorruption: boolean;
  backupPath: string | null;
}

export interface TextDataAdapter {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, data: string): Promise<void>;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

/** Formats a local timestamp without UTC conversion for a collision-safe backup name. */
export function formatBackupTimestamp(date: Date): string {
  return `${date.getFullYear()}${twoDigits(date.getMonth() + 1)}${twoDigits(date.getDate())}`
    + `-${twoDigits(date.getHours())}${twoDigits(date.getMinutes())}${twoDigits(date.getSeconds())}`;
}

/** Copies the exact damaged JSON text without overwriting an earlier backup. */
export async function backupCorruptPluginData(
  adapter: TextDataAdapter,
  dataPath: string,
  now = new Date(),
): Promise<string | null> {
  if (!await adapter.exists(dataPath)) return null;
  const damagedData = await adapter.read(dataPath);
  let backupPath = `${dataPath}.bak`;
  if (await adapter.exists(backupPath)) {
    const timestampedBase = `${backupPath}-${formatBackupTimestamp(now)}`;
    backupPath = timestampedBase;
    let suffix = 2;
    while (await adapter.exists(backupPath)) {
      backupPath = `${timestampedBase}-${suffix}`;
      suffix += 1;
    }
  }
  await adapter.write(backupPath, damagedData);
  return backupPath;
}

/** Backs up unreadable plugin data before allowing defaults to replace it. */
export async function loadPluginDataSafely(
  load: () => Promise<unknown>,
  backupCorruptData: () => Promise<string | null>,
): Promise<SafePluginDataLoadResult> {
  try {
    return { data: await load(), recoveredFromCorruption: false, backupPath: null };
  } catch {
    const backupPath = await backupCorruptData();
    return { data: null, recoveredFromCorruption: true, backupPath };
  }
}
