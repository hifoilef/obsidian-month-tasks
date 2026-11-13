import { formatIsoDate } from './date-utils';

/** Detects a local calendar-day rollover without converting through UTC. */
export function hasLocalDateChanged(previousIso: string, now: Date): boolean {
  return formatIsoDate(now) !== previousIso;
}

/** Rejects scan results that completed after a newer refresh or view closure. */
export function isCurrentRefreshGeneration(
  completedGeneration: number,
  currentGeneration: number,
): boolean {
  return completedGeneration === currentGeneration;
}
