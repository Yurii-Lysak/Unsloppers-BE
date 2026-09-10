export interface HistoryRowSnapshot {
  value: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

/**
 * Resolves the current effective-dated history value. Prefers the open row
 * (`effectiveTo IS NULL`); otherwise returns the row with the latest
 * `effectiveFrom` — matching AD-7 pre-migration edge handling.
 */
export function currentHistoryValue(
  rows: HistoryRowSnapshot[],
): HistoryRowSnapshot | null {
  if (rows.length === 0) {
    return null;
  }
  const open = rows.find((row) => row.effectiveTo === null);
  if (open) {
    return open;
  }
  return rows.reduce((latest, row) =>
    row.effectiveFrom.getTime() > latest.effectiveFrom.getTime() ? row : latest,
  );
}
