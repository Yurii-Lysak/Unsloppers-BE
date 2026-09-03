import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  DeniedCoveragePair,
  FlagGatedCoverageKey,
  MatrixPair,
} from './access-matrix';
import { flagGatedCoverageKey, missingMatrixCoverage } from './access-matrix';

const RUN_DIR = join(__dirname, '.matrix-coverage-run');
const DENIED_FILE = join(RUN_DIR, 'denied.json');
const FLAG_GATED_FILE = join(RUN_DIR, 'flag-gated.json');
const MATRIX_FILE = join(RUN_DIR, 'matrix.json');

function ensureRunDir(): void {
  mkdirSync(RUN_DIR, { recursive: true });
}

function readJsonFile<T>(path: string): T[] {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T[];
  } catch {
    return [];
  }
}

function writeJsonFile<T>(path: string, value: T[]): void {
  ensureRunDir();
  writeFileSync(path, JSON.stringify(value), 'utf8');
}

const matrixPairKey = (pair: MatrixPair): string =>
  `${pair.section}/${pair.audience}`;

const deniedPairKey = (pair: DeniedCoveragePair): string => {
  if (pair.kind === 'matrix') {
    return `matrix:${pair.section}/${pair.audience}`;
  }
  return `projectLine:${pair.section}/${pair.rule}`;
};

export function recordDeniedCoverage(pair: DeniedCoveragePair): void {
  const list = readJsonFile<DeniedCoveragePair>(DENIED_FILE);
  const seen = new Set(list.map(deniedPairKey));
  const key = deniedPairKey(pair);
  if (seen.has(key)) {
    return;
  }
  list.push(pair);
  writeJsonFile(DENIED_FILE, list);
}

export function getRecordedDeniedPairs(): DeniedCoveragePair[] {
  return readJsonFile<DeniedCoveragePair>(DENIED_FILE);
}

export function resetDeniedCoverage(): void {
  writeJsonFile(DENIED_FILE, []);
}

export function recordFlagGatedCoverage(key: FlagGatedCoverageKey): void {
  const list = readJsonFile<FlagGatedCoverageKey>(FLAG_GATED_FILE);
  const seen = new Set(list.map(flagGatedCoverageKey));
  const dedupeKey = flagGatedCoverageKey(key);
  if (seen.has(dedupeKey)) {
    return;
  }
  list.push(key);
  writeJsonFile(FLAG_GATED_FILE, list);
}

export function getRecordedFlagGatedKeys(): FlagGatedCoverageKey[] {
  return readJsonFile<FlagGatedCoverageKey>(FLAG_GATED_FILE);
}

export function resetFlagGatedCoverage(): void {
  writeJsonFile(FLAG_GATED_FILE, []);
}

/** Records a full-matrix pair; dedupes on section/audience key (Story 1.15). */
export function recordMatrixCoverage(pair: MatrixPair): void {
  const existing = readJsonFile<MatrixPair>(MATRIX_FILE);
  const seen = new Set(existing.map(matrixPairKey));
  const key = matrixPairKey(pair);
  if (seen.has(key)) {
    return;
  }
  existing.push(pair);
  writeJsonFile(MATRIX_FILE, existing);
}

export function getRecordedMatrixPairs(): MatrixPair[] {
  return readJsonFile<MatrixPair>(MATRIX_FILE);
}

export function resetMatrixCoverage(): void {
  writeJsonFile(MATRIX_FILE, []);
}

/** @internal test helper — surfaces gaps without throwing. */
export function missingRecordedMatrixCoverage(): MatrixPair[] {
  return missingMatrixCoverage(getRecordedMatrixPairs());
}
