import type { DeniedCoveragePair, FlagGatedCoverageKey } from './access-matrix';

const recorded: DeniedCoveragePair[] = [];
const flagGatedRecorded: FlagGatedCoverageKey[] = [];

export function recordDeniedCoverage(pair: DeniedCoveragePair): void {
  recorded.push(pair);
}

export function getRecordedDeniedPairs(): DeniedCoveragePair[] {
  return [...recorded];
}

export function resetDeniedCoverage(): void {
  recorded.length = 0;
}

export function recordFlagGatedCoverage(key: FlagGatedCoverageKey): void {
  flagGatedRecorded.push(key);
}

export function getRecordedFlagGatedKeys(): FlagGatedCoverageKey[] {
  return [...flagGatedRecorded];
}

export function resetFlagGatedCoverage(): void {
  flagGatedRecorded.length = 0;
}
