import { BootcampIdentity } from './seed.manifest';
import { EmptySeedPopulationError } from './seed.errors';

export interface DedupeResult<T extends { email: string }> {
  identities: T[];
  duplicateEmails: string[];
}

/**
 * Case-insensitive dedupe key — the manifest or TimeTracker may repeat the
 * same person's email with differing case; email identity should not depend
 * on casing. The original-cased email is preserved for DB writes.
 */
export function normalizeEmailKey(email: string): string {
  return email.toLowerCase();
}

/**
 * Deduplicates identities by email (case-insensitively). If two records share
 * an email, the last one wins. Order-preserving over the surviving identities.
 */
export function dedupeIdentitiesByEmail<T extends { email: string }>(
  identities: T[],
): DedupeResult<T> {
  const byEmail = new Map<string, T>();
  const duplicateEmails = new Set<string>();

  for (const identity of identities) {
    const key = normalizeEmailKey(identity.email);
    if (byEmail.has(key)) {
      duplicateEmails.add(identity.email);
    }
    byEmail.set(key, identity);
  }

  return {
    identities: [...byEmail.values()],
    duplicateEmails: [...duplicateEmails],
  };
}

/** Halts before any DB write when the manifest yields zero identities. */
export function assertNonEmptySeedPopulation(count: number): void {
  if (count === 0) {
    throw new EmptySeedPopulationError(
      'Bootcamp seed manifest contains no identities after deduplication. ' +
        'Halting before any write — populate prisma/seed/data/bootcamp-identities.json.',
    );
  }
}

/** @deprecated Use {@link dedupeIdentitiesByEmail}. */
export const dedupeEmployeesByEmail = dedupeIdentitiesByEmail;

/** @deprecated Use {@link assertNonEmptySeedPopulation}. */
export function assertPopulationSize(count: number): void {
  assertNonEmptySeedPopulation(count);
}

/** @deprecated Bootcamp pivot (Aug 2026) — floor removed; perf testing uses separate story. */
export const MIN_IDENTITY_COUNT = 1;

/** @deprecated Bootcamp pivot (Aug 2026) — ceiling removed with TT Accounting fetch. */
export const MAX_IDENTITY_COUNT = Number.MAX_SAFE_INTEGER;

export type SeedIdentity = BootcampIdentity;
