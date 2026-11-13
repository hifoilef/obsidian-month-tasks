import { describe, expect, it } from 'vitest';
import {
  hasLocalDateChanged,
  isCurrentRefreshGeneration,
} from '../src/calendar/refresh-policy';

describe('calendar refresh policy', () => {
  it('does not refresh again while the local calendar date is unchanged', () => {
    expect(hasLocalDateChanged('2026-10-19', new Date(2026, 9, 19, 23, 59))).toBe(false);
  });

  it('detects a simulated local midnight rollover', () => {
    expect(hasLocalDateChanged('2026-10-19', new Date(2026, 9, 20, 0, 0))).toBe(true);
  });

  it('rejects an async result after its refresh generation is invalidated', () => {
    expect(isCurrentRefreshGeneration(4, 4)).toBe(true);
    expect(isCurrentRefreshGeneration(4, 5)).toBe(false);
  });
});
