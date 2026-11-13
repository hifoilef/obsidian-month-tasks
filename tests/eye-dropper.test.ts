import { describe, expect, it } from 'vitest';
import { getEyeDropperConstructor } from '../src/eye-dropper';

describe('EyeDropper capability detection', () => {
  it('hides the capability when the API is unavailable or malformed', () => {
    expect(getEyeDropperConstructor({})).toBeUndefined();
    expect(getEyeDropperConstructor({ EyeDropper: true })).toBeUndefined();
    expect(getEyeDropperConstructor(null)).toBeUndefined();
  });

  it('returns a supported constructor', () => {
    class FakeEyeDropper {
      async open(): Promise<{ sRGBHex: string }> {
        return { sRGBHex: '#abcdef' };
      }
    }
    expect(getEyeDropperConstructor({ EyeDropper: FakeEyeDropper })).toBe(FakeEyeDropper);
  });
});
