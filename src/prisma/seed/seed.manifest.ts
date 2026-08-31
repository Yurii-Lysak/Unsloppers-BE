import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SeedManifestError } from './seed.errors';

/** One bootcamp test account — same identity anchor fields TimeTracker exposes. */
export interface BootcampIdentity {
  id: number;
  email: string;
  name: string;
  hash: string;
  countryCode: string;
}

export interface BootcampSeedManifest {
  version: number;
  description?: string;
  identities: BootcampIdentity[];
}

const DEFAULT_MANIFEST_FILE = 'bootcamp-identities.json';

export function resolveManifestPath(manifestPath?: string): string {
  if (manifestPath != null && manifestPath.trim() !== '') {
    return manifestPath;
  }

  // Compiled seed code lives under dist/src/prisma/seed; nest copies JSON assets
  // to dist/prisma/seed/data (see nest-cli.json). Try both layouts.
  const candidates = [
    join(__dirname, 'data', DEFAULT_MANIFEST_FILE),
    join(
      process.cwd(),
      'dist',
      'prisma',
      'seed',
      'data',
      DEFAULT_MANIFEST_FILE,
    ),
    join(process.cwd(), 'src', 'prisma', 'seed', 'data', DEFAULT_MANIFEST_FILE),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

export function loadBootcampSeedManifest(
  manifestPath?: string,
): BootcampSeedManifest {
  const path = resolveManifestPath(manifestPath);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    throw new SeedManifestError(
      `Bootcamp seed manifest not found at ${path}. ` +
        'Ensure prisma/seed/data/bootcamp-identities.json exists (see README Seed data).',
      error,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    throw new SeedManifestError(
      `Bootcamp seed manifest at ${path} is not valid JSON.`,
      error,
    );
  }

  return validateBootcampSeedManifest(parsed, path);
}

export function validateBootcampSeedManifest(
  value: unknown,
  sourceLabel = 'manifest',
): BootcampSeedManifest {
  if (value == null || typeof value !== 'object') {
    throw new SeedManifestError(
      `Bootcamp seed manifest at ${sourceLabel} must be a JSON object.`,
    );
  }

  const manifest = value as Record<string, unknown>;
  if (typeof manifest.version !== 'number') {
    throw new SeedManifestError(
      `Bootcamp seed manifest at ${sourceLabel} is missing numeric "version".`,
    );
  }
  if (!Array.isArray(manifest.identities)) {
    throw new SeedManifestError(
      `Bootcamp seed manifest at ${sourceLabel} is missing "identities" array.`,
    );
  }

  validateBootcampIdentities(manifest.identities, sourceLabel);

  return {
    version: manifest.version,
    description:
      typeof manifest.description === 'string'
        ? manifest.description
        : undefined,
    identities: manifest.identities as BootcampIdentity[],
  };
}

export function validateBootcampIdentities(
  identities: unknown[],
  sourceLabel = 'manifest',
): void {
  identities.forEach((identity, index) => {
    if (
      identity == null ||
      typeof identity !== 'object' ||
      typeof (identity as BootcampIdentity).id !== 'number' ||
      typeof (identity as BootcampIdentity).email !== 'string' ||
      (identity as BootcampIdentity).email.trim() === '' ||
      typeof (identity as BootcampIdentity).name !== 'string' ||
      (identity as BootcampIdentity).name.trim() === '' ||
      typeof (identity as BootcampIdentity).hash !== 'string' ||
      (identity as BootcampIdentity).hash.trim() === '' ||
      typeof (identity as BootcampIdentity).countryCode !== 'string' ||
      (identity as BootcampIdentity).countryCode.trim() === ''
    ) {
      throw new SeedManifestError(
        `Bootcamp seed manifest at ${sourceLabel}: identities[${index}] is missing a required field ` +
          '(id/email/name/hash/countryCode).',
      );
    }
  });
}
