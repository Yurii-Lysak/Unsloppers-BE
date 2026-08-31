/** Thrown when a TimeTracker response fails required-field validation (either endpoint). */
export class TimetrackerValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimetrackerValidationError';
  }
}

/** Thrown when the bundled bootcamp seed manifest cannot be read or parsed. */
export class SeedManifestError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause != null ? { cause } : undefined);
    this.name = 'SeedManifestError';
  }
}

/**
 * Thrown when the seed manifest has no identities to write — the only
 * population-size guard after the bootcamp pivot from 500+ to a fixed list.
 */
export class EmptySeedPopulationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmptySeedPopulationError';
  }
}

/** Thrown before seed writes when the initial credential secret is unavailable. */
export class InitialPasswordMissingError extends Error {
  constructor() {
    super('BOOTCAMP_INITIAL_PASSWORD is required to provision credentials');
    this.name = 'InitialPasswordMissingError';
  }
}

/** Thrown before writes when bcrypt would silently truncate the seed password. */
export class InitialPasswordTooLongError extends Error {
  constructor() {
    super('BOOTCAMP_INITIAL_PASSWORD exceeds bcrypt input capacity');
    this.name = 'InitialPasswordTooLongError';
  }
}

/** @deprecated Renamed to {@link EmptySeedPopulationError}; kept for test imports during transition. */
export class PopulationSizeError extends EmptySeedPopulationError {}
