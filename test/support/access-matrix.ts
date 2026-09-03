/**
 * Machine-readable form of the profile section access matrix.
 *
 * Source of truth: the workspace spec at
 * `_bmad-output/specs/spec-people-management-platform/access-model.md`,
 * sections "Section access matrix" and "Rules that follow from the matrix".
 *
 * The spec states the matrix as a prose table, which no suite can be driven
 * from. This file is the machine-readable form: the `Record` types below make a
 * missing section or audience a compile error, and `assertMatrixCoverage` makes
 * an untested pair a test failure. When access-model.md changes, this file
 * changes in the same commit.
 *
 * HR Admin is deliberately absent as an audience. The spec grants it full
 * access to everything and does not model it as a matrix column.
 */

export const PROFILE_SECTIONS = {
  S1: 'Identity card',
  S2: 'Personal contacts',
  S3: 'Emergency contacts',
  S4: 'Employment',
  S5: 'Documents',
  S6: 'Risks',
  S7: 'Management notes',
  S8: 'Feedbacks',
  S9: 'Career timeline',
  S10: 'Leaves and absences',
  S11: 'Projects',
  S12: 'CDS',
  S13: 'Mentorship',
  S14: 'Action items and tasks',
  S15: 'Request history',
  S16: 'Custom fields',
} as const;

export type ProfileSection = keyof typeof PROFILE_SECTIONS;

export const PROFILE_AUDIENCES = {
  self: 'Self',
  reportingLine: 'Manager line (reporting)',
  pp: 'People Partner (assigned PP and the HR line above them)',
  colleague: 'Colleague',
  sharedLink: 'Shared link',
} as const;

export type ProfileAudience = keyof typeof PROFILE_AUDIENCES;

/**
 * `perFieldVisibility` is not a weaker `read`: it means the section renders but
 * each field carries its own visibility, so the cell alone does not decide the
 * outcome (S16, spec rule 5).
 */
export type AccessLevel = 'none' | 'read' | 'readWrite' | 'perFieldVisibility';

export interface AccessCell {
  readonly level: AccessLevel;
  /**
   * Shared link only. `on` is the spec's "on by default", `off` is its `cfg`
   * (available but disabled until enabled for that specific link).
   */
  readonly sharedLinkDefault?: 'on' | 'off';
  /** Narrowing carried by the spec cell itself, e.g. "project name only". */
  readonly qualifier?: string;
  /** A later spec rule overriding this cell for one audience or one field. */
  readonly exception?: string;
}

const NO_ACCESS: AccessCell = { level: 'none' };

export const ACCESS_MATRIX: Record<
  ProfileSection,
  Record<ProfileAudience, AccessCell>
> = {
  S1: {
    self: { level: 'read', qualifier: 'own photo is writable' },
    reportingLine: { level: 'readWrite' },
    pp: { level: 'readWrite' },
    colleague: {
      level: 'read',
      exception:
        'the mentor field follows spec rule 6 (decision D5): Manager line and PP only, never Colleague',
    },
    sharedLink: { level: 'read', sharedLinkDefault: 'on' },
  },
  S2: {
    self: { level: 'readWrite' },
    reportingLine: { level: 'read' },
    pp: { level: 'readWrite' },
    colleague: NO_ACCESS,
    sharedLink: { level: 'read', sharedLinkDefault: 'off' },
  },
  S3: {
    self: { level: 'readWrite' },
    reportingLine: { level: 'read' },
    pp: { level: 'readWrite' },
    colleague: NO_ACCESS,
    sharedLink: NO_ACCESS,
  },
  S4: {
    self: { level: 'read' },
    reportingLine: { level: 'readWrite' },
    pp: { level: 'readWrite' },
    colleague: NO_ACCESS,
    sharedLink: { level: 'read', sharedLinkDefault: 'off' },
  },
  S5: {
    self: {
      level: 'read',
      qualifier: 'own documents only; may upload certificates',
    },
    reportingLine: { level: 'read' },
    pp: { level: 'readWrite' },
    colleague: NO_ACCESS,
    sharedLink: { level: 'read', sharedLinkDefault: 'off' },
  },
  S6: {
    self: NO_ACCESS,
    reportingLine: { level: 'readWrite' },
    pp: { level: 'readWrite' },
    colleague: NO_ACCESS,
    sharedLink: { level: 'read', sharedLinkDefault: 'off' },
  },
  S7: {
    self: {
      level: 'read',
      qualifier: 'only notes flagged "visible for employee"',
    },
    reportingLine: {
      level: 'readWrite',
      exception:
        'spec rule 2: a PM gets read only, and only notes flagged "visible for PM". This is the single documented exception to "Manager sees everything"',
    },
    pp: { level: 'readWrite' },
    colleague: NO_ACCESS,
    sharedLink: NO_ACCESS,
  },
  S8: {
    self: {
      level: 'read',
      qualifier: 'only feedback shared with the employee',
    },
    reportingLine: { level: 'readWrite' },
    pp: { level: 'readWrite' },
    colleague: NO_ACCESS,
    sharedLink: { level: 'read', sharedLinkDefault: 'off' },
  },
  S9: {
    self: { level: 'read' },
    reportingLine: {
      level: 'readWrite',
      exception:
        'spec rule / Epic 7: writes are narrowed to assigned UM (ReportingLine) and PP only — ProjectLine Manager access does not grant timeline writes',
    },
    pp: { level: 'readWrite' },
    colleague: NO_ACCESS,
    sharedLink: { level: 'read', sharedLinkDefault: 'off' },
  },
  S10: {
    self: { level: 'read' },
    reportingLine: { level: 'read' },
    pp: { level: 'read' },
    colleague: { level: 'read', qualifier: 'dates only, leave type hidden' },
    sharedLink: { level: 'read', sharedLinkDefault: 'off' },
  },
  S11: {
    self: { level: 'read' },
    reportingLine: { level: 'read' },
    pp: { level: 'read' },
    colleague: { level: 'read', qualifier: 'project name only' },
    sharedLink: { level: 'read', sharedLinkDefault: 'off' },
  },
  S12: {
    self: { level: 'read', qualifier: 'may complete own IDP' },
    reportingLine: { level: 'readWrite' },
    pp: { level: 'readWrite' },
    colleague: NO_ACCESS,
    sharedLink: { level: 'read', sharedLinkDefault: 'off' },
  },
  S13: {
    self: {
      level: 'readWrite',
      qualifier:
        'writable part is the own open-to-mentor flag; pairs and the closing feedback about own pair are read only',
    },
    reportingLine: { level: 'readWrite' },
    pp: { level: 'readWrite' },
    colleague: NO_ACCESS,
    sharedLink: NO_ACCESS,
  },
  S14: {
    self: { level: 'read', qualifier: 'own items; may mark them complete' },
    reportingLine: { level: 'readWrite' },
    pp: { level: 'readWrite' },
    colleague: NO_ACCESS,
    sharedLink: NO_ACCESS,
  },
  S15: {
    self: NO_ACCESS,
    reportingLine: { level: 'read' },
    pp: { level: 'read' },
    colleague: NO_ACCESS,
    sharedLink: {
      level: 'read',
      sharedLinkDefault: 'off',
      qualifier: 'a DM sees their own requests natively, not via the link',
    },
  },
  S16: {
    self: { level: 'perFieldVisibility' },
    reportingLine: { level: 'readWrite' },
    pp: { level: 'readWrite' },
    colleague: { level: 'perFieldVisibility' },
    sharedLink: { level: 'read', sharedLinkDefault: 'off' },
  },
};

/**
 * Spec rule 3: the Colleague view is a whitelist. Exactly S1, S10 (dates only,
 * leave type hidden), and the S11 project name, plus whatever S16 custom fields
 * are individually marked colleague-visible. Every other section is absent for a
 * Colleague, enforced at the API rather than by hiding fields in the UI.
 */
export const COLLEAGUE_WHITELIST = [
  'S1',
  'S10',
  'S11',
  'S16',
] as const satisfies readonly ProfileSection[];

export interface MatrixPair {
  readonly section: ProfileSection;
  readonly audience: ProfileAudience;
}

export interface MatrixCell extends MatrixPair {
  readonly cell: AccessCell;
}

const sectionKeys = Object.keys(PROFILE_SECTIONS) as ProfileSection[];
const audienceKeys = Object.keys(PROFILE_AUDIENCES) as ProfileAudience[];

/** Every section/audience pair, for `describe.each` / `it.each` table driving. */
export function matrixCells(): MatrixCell[] {
  return sectionKeys.flatMap((section) =>
    audienceKeys.map((audience) => ({
      section,
      audience,
      cell: ACCESS_MATRIX[section][audience],
    })),
  );
}

const pairKey = (pair: MatrixPair): string =>
  `${pair.section}/${pair.audience}`;

/** Pairs present in the matrix that the given collection does not cover. */
export function missingMatrixCoverage(
  covered: Iterable<MatrixPair>,
): MatrixPair[] {
  const seen = new Set<string>();
  for (const pair of covered) {
    seen.add(pairKey(pair));
  }

  return matrixCells()
    .filter((entry) => !seen.has(pairKey(entry)))
    .map(({ section, audience }) => ({ section, audience }));
}

/**
 * Fails when a section/audience pair has no test, which is the whole point of
 * AD-13: a new section that silently defaults to allowed is the failure mode
 * this harness exists to prevent. Call it from the matrix suite once the
 * resolver exists.
 */
export function assertMatrixCoverage(covered: Iterable<MatrixPair>): void {
  const missing = missingMatrixCoverage(covered);
  if (missing.length === 0) {
    return;
  }

  const listed = missing.map(pairKey).join(', ');
  throw new Error(
    `Access matrix coverage is incomplete. ${missing.length} section/audience pair(s) have no test: ${listed}. ` +
      'Add a case for each, or remove the pair from access-matrix.ts if access-model.md dropped it.',
  );
}

/** Audiences that can hold `level: 'none'` denial cells in the matrix today. */
export type DeniedMatrixAudience = Extract<
  ProfileAudience,
  'self' | 'colleague' | 'sharedLink'
>;

export interface DeniedMatrixCell extends MatrixCell {
  readonly audience: DeniedMatrixAudience;
}

/** AD-14 — Project line denials not represented as `none` in the combined matrix. */
export type ProjectLineDeniedRule = 'profile-absent' | 'payload-narrowed';

export interface ProjectLineDeniedCell {
  readonly section: ProfileSection;
  readonly audience: 'projectLine';
  readonly rule: ProjectLineDeniedRule;
}

export type FlagGatedRule =
  'field-absent' | 'record-absent' | 'write-denied' | 'payload-narrowed';

export interface FlagGatedCase {
  readonly section: ProfileSection;
  /** C1 role label for the viewer under test. */
  readonly audience: 'Self' | 'Colleague' | 'ProjectLine' | 'ReportingLine';
  readonly rule: FlagGatedRule;
  readonly absentFields?: readonly string[];
  readonly seedRef?: string;
}

export type FlagGatedCoverageKey = Pick<
  FlagGatedCase,
  'section' | 'audience' | 'rule'
>;

export type DeniedCoveragePair =
  | {
      readonly kind: 'matrix';
      readonly section: ProfileSection;
      readonly audience: DeniedMatrixAudience;
    }
  | {
      readonly kind: 'projectLine';
      readonly section: ProfileSection;
      readonly rule: ProjectLineDeniedRule;
    };

const deniedAudienceKeys: DeniedMatrixAudience[] = [
  'self',
  'colleague',
  'sharedLink',
];

/** Every `level: 'none'` cell — the denial enumeration for Story 1.14. */
export function deniedMatrixCells(): DeniedMatrixCell[] {
  return matrixCells().filter(
    (entry): entry is DeniedMatrixCell =>
      entry.cell.level === 'none' &&
      (deniedAudienceKeys as readonly string[]).includes(entry.audience),
  );
}

/** AD-14 narrowed cells for Project line viewers only. */
export function projectLineDeniedCells(): ProjectLineDeniedCell[] {
  return [
    { section: 'S2', audience: 'projectLine', rule: 'profile-absent' },
    { section: 'S3', audience: 'projectLine', rule: 'profile-absent' },
    { section: 'S5', audience: 'projectLine', rule: 'payload-narrowed' },
  ];
}

/** Explicit flag-gated catalog — not inferred from matrix exception text. */
export function flagGatedCases(): FlagGatedCase[] {
  return [
    {
      section: 'S7',
      audience: 'Self',
      rule: 'record-absent',
      seedRef: 'management-notes.e2e-spec.ts',
    },
    {
      section: 'S7',
      audience: 'ProjectLine',
      rule: 'record-absent',
      seedRef: 'management-notes.e2e-spec.ts',
    },
    {
      section: 'S7',
      audience: 'ProjectLine',
      rule: 'write-denied',
      seedRef: 'management-notes.e2e-spec.ts',
    },
    {
      section: 'S1',
      audience: 'Colleague',
      rule: 'field-absent',
      absentFields: ['mentor'],
      seedRef: 'employee-profile.e2e-spec.ts',
    },
    {
      section: 'S1',
      audience: 'Self',
      rule: 'field-absent',
      absentFields: ['mentor'],
      seedRef: 'employee-profile.e2e-spec.ts',
    },
    {
      section: 'S10',
      audience: 'Colleague',
      rule: 'field-absent',
      absentFields: ['type', 'approvalState'],
      seedRef: 'employee-profile.e2e-spec.ts',
    },
    {
      section: 'S11',
      audience: 'Colleague',
      rule: 'payload-narrowed',
      absentFields: ['pm', 'dm', 'period'],
      seedRef: 'employee-profile.e2e-spec.ts',
    },
    {
      section: 'S16',
      audience: 'Colleague',
      rule: 'field-absent',
      seedRef: 'employee-profile-custom-fields.e2e-spec.ts',
    },
    {
      section: 'S5',
      audience: 'ProjectLine',
      rule: 'payload-narrowed',
      seedRef: 'access-matrix-leaks.e2e-spec.ts',
    },
    {
      section: 'S9',
      audience: 'ProjectLine',
      rule: 'write-denied',
      seedRef: 'timeline.e2e-spec.ts',
    },
  ];
}

export const flagGatedCoverageKey = (key: FlagGatedCoverageKey): string =>
  `${key.section}/${key.audience}/${key.rule}`;

export function missingFlagGatedCoverage(
  covered: Iterable<FlagGatedCoverageKey>,
): FlagGatedCoverageKey[] {
  const seen = new Set<string>();
  for (const key of covered) {
    seen.add(flagGatedCoverageKey(key));
  }

  return flagGatedCases().filter(
    (entry) => !seen.has(flagGatedCoverageKey(entry)),
  );
}

/** Story 1.14 flag-gated catalog coverage gate. */
export function assertFlagGatedCoverage(
  covered: Iterable<FlagGatedCoverageKey>,
): void {
  const missing = missingFlagGatedCoverage(covered);
  if (missing.length === 0) {
    return;
  }

  const listed = missing.map(flagGatedCoverageKey).join(', ');
  throw new Error(
    `Flag-gated coverage is incomplete. ${missing.length} case(s) have no test: ${listed}.`,
  );
}

const deniedCoverageKey = (pair: DeniedCoveragePair): string => {
  if (pair.kind === 'matrix') {
    return `matrix:${pair.section}/${pair.audience}`;
  }
  return `projectLine:${pair.section}/${pair.rule}`;
};

/** Pairs from denied + ProjectLine enumerations that lack a recorded test. */
export function missingDeniedMatrixCoverage(
  covered: Iterable<DeniedCoveragePair>,
): DeniedCoveragePair[] {
  const seen = new Set<string>();
  for (const pair of covered) {
    seen.add(deniedCoverageKey(pair));
  }

  const required: DeniedCoveragePair[] = [
    ...deniedMatrixCells().map(
      (cell) =>
        ({
          kind: 'matrix',
          section: cell.section,
          audience: cell.audience,
        }) satisfies DeniedCoveragePair,
    ),
    ...projectLineDeniedCells().map(
      (cell) =>
        ({
          kind: 'projectLine',
          section: cell.section,
          rule: cell.rule,
        }) satisfies DeniedCoveragePair,
    ),
  ];

  return required.filter((pair) => !seen.has(deniedCoverageKey(pair)));
}

/**
 * Story 1.14 coverage gate — denied and ProjectLine denial pairs only.
 * Full 80-pair `assertMatrixCoverage` remains Story 1.15.
 */
export function assertDeniedMatrixCoverage(
  covered: Iterable<DeniedCoveragePair>,
): void {
  const missing = missingDeniedMatrixCoverage(covered);
  if (missing.length === 0) {
    return;
  }

  const listed = missing
    .map((pair) =>
      pair.kind === 'matrix'
        ? `${pair.section}/${pair.audience}`
        : `${pair.section}/projectLine:${pair.rule}`,
    )
    .join(', ');
  throw new Error(
    `Denied matrix coverage is incomplete. ${missing.length} pair(s) have no test: ${listed}.`,
  );
}
