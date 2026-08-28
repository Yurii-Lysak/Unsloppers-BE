/** Thrown when a TimeTracker response fails required-field validation (either endpoint). */
export class TimetrackerValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimetrackerValidationError';
  }
}

/**
 * Thrown when the deduplicated Accounting identity count falls outside the
 * expected [500, 2000] band — the spec's "Ask First" thresholds. Both sides
 * halt before any write starts; there is no automated pad/truncate.
 */
export class PopulationSizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PopulationSizeError';
  }
}
