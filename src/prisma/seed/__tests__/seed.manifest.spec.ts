import { join } from 'node:path';
import {
  assertNonEmptySeedPopulation,
  dedupeIdentitiesByEmail,
  normalizeEmailKey,
} from '../seed.helpers';
import { EmptySeedPopulationError, SeedManifestError } from '../seed.errors';
import {
  loadBootcampSeedManifest,
  validateBootcampIdentities,
  validateBootcampSeedManifest,
} from '../seed.manifest';

const fixturePath = join(
  __dirname,
  'fixtures',
  'bootcamp-identities.fixture.json',
);

describe('loadBootcampSeedManifest', () => {
  it('loads and validates the test fixture', () => {
    const manifest = loadBootcampSeedManifest(fixturePath);
    expect(manifest.version).toBe(1);
    expect(manifest.identities).toHaveLength(3);
  });

  it('throws SeedManifestError when the file is missing', () => {
    expect(() =>
      loadBootcampSeedManifest('/no/such/bootcamp-identities.json'),
    ).toThrow(SeedManifestError);
  });

  it('throws SeedManifestError when identities is not an array', () => {
    expect(() =>
      validateBootcampSeedManifest({ version: 1, identities: null }, 'test'),
    ).toThrow(SeedManifestError);
  });
});

describe('validateBootcampIdentities', () => {
  it('throws when email is empty', () => {
    expect(() =>
      validateBootcampIdentities([
        {
          id: 1,
          email: '',
          name: 'Name',
          hash: 'hash',
          countryCode: 'UA',
        },
      ]),
    ).toThrow(SeedManifestError);
  });
});

describe('dedupeIdentitiesByEmail', () => {
  it('keeps the last record for a duplicate email (case-insensitive key)', () => {
    const first = {
      id: 1,
      email: 'User@Example.com',
      name: 'First',
      hash: 'a',
      countryCode: 'US',
    };
    const second = {
      id: 2,
      email: 'user@example.com',
      name: 'Second',
      hash: 'b',
      countryCode: 'US',
    };
    const result = dedupeIdentitiesByEmail([first, second]);
    expect(result.identities).toHaveLength(1);
    expect(result.identities[0].name).toBe('Second');
    expect(result.identities[0].email).toBe('user@example.com');
  });
});

describe('assertNonEmptySeedPopulation', () => {
  it('does not throw for a positive count', () => {
    expect(() => assertNonEmptySeedPopulation(24)).not.toThrow();
  });

  it('throws EmptySeedPopulationError for zero', () => {
    expect(() => assertNonEmptySeedPopulation(0)).toThrow(
      EmptySeedPopulationError,
    );
  });
});

describe('normalizeEmailKey', () => {
  it('lowercases the email for comparisons', () => {
    expect(normalizeEmailKey('User@Example.com')).toBe('user@example.com');
  });
});
