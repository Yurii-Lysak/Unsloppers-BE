/**
 * Synthetic layer (spec Approach — "layers synthetic values on top for
 * every field/table TimeTracker doesn't carry"). Today that's exactly the
 * four employment-history dimensions: grade, position, department,
 * employment type. No other platform-native table exists yet (Department,
 * roles, risk, notes) — resolved scope decision (spec Ask First, "Confirm
 * which platform-native tables to seed now"): the synthetic layer is a
 * no-op beyond these four history rows until those tables exist.
 *
 * Values are picked deterministically from a hash of the identity's own
 * email, so the same identity always gets the same synthetic profile
 * (stable across seed reruns even though, per `seed.service.ts`, a rerun
 * never actually re-derives it once a history row already exists).
 */

const GRADES = ['Junior', 'Middle', 'Senior', 'Lead'] as const;
const POSITIONS = [
  'Software Engineer',
  'QA Engineer',
  'DevOps Engineer',
  'Product Manager',
  'Designer',
] as const;
const DEPARTMENTS = [
  'Engineering',
  'Quality Assurance',
  'Design',
  'Product',
  'Operations',
] as const;
const EMPLOYMENT_TYPES = ['FTE', 'Subcontractor'] as const;

const MIN_TENURE_DAYS = 30;
const TENURE_SPREAD_DAYS = 1065; // ~30 days .. ~3 years

export interface SyntheticEmployeeProfile {
  grade: string;
  position: string;
  department: string;
  employmentType: string;
  /** Synthetic start-of-tenure date for the initial history rows. */
  effectiveFrom: Date;
}

/** Small deterministic string hash (FNV-1a-ish) — no crypto needed for pseudo-random picks. */
function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pick<T>(items: readonly T[], seed: number): T {
  return items[seed % items.length];
}

export function buildSyntheticProfile(
  seedKey: string,
  now: Date = new Date(),
): SyntheticEmployeeProfile {
  // Each dimension is hashed from an independently salted input rather than
  // bit-shifting one shared hash — bit-shifted derivatives of the same hash
  // share most of their bits and end up correlated per employee, which
  // undermines a realistic-looking (independent) synthetic spread.
  const tenureHash = hashString(`${seedKey}:tenure`);
  const gradeHash = hashString(`${seedKey}:grade`);
  const positionHash = hashString(`${seedKey}:position`);
  const departmentHash = hashString(`${seedKey}:department`);
  const employmentTypeHash = hashString(`${seedKey}:employmentType`);

  const daysAgo = MIN_TENURE_DAYS + (tenureHash % TENURE_SPREAD_DAYS);
  const effectiveFrom = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);

  return {
    grade: pick(GRADES, gradeHash),
    position: pick(POSITIONS, positionHash),
    department: pick(DEPARTMENTS, departmentHash),
    employmentType: pick(EMPLOYMENT_TYPES, employmentTypeHash),
    effectiveFrom,
  };
}
