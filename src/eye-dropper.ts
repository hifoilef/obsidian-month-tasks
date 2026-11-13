export interface EyeDropperApi {
  open(): Promise<{ sRGBHex: string }>;
}

export interface EyeDropperConstructor {
  new(): EyeDropperApi;
}

/** Returns the optional browser API only when it is actually callable. */
export function getEyeDropperConstructor(scope: unknown): EyeDropperConstructor | undefined {
  if (typeof scope !== 'object' || scope === null) return undefined;
  const candidate = (scope as { EyeDropper?: unknown }).EyeDropper;
  return typeof candidate === 'function'
    ? candidate as EyeDropperConstructor
    : undefined;
}
