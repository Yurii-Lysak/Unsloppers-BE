import {
  ACCESS_MATRIX,
  assertDeniedMatrixCoverage,
  assertFlagGatedCoverage,
  assertMatrixCoverage,
  COLLEAGUE_WHITELIST,
  deniedMatrixCells,
  flagGatedCases,
  matrixCells,
  missingMatrixCoverage,
  PROFILE_AUDIENCES,
  PROFILE_SECTIONS,
  ProfileAudience,
  ProfileSection,
  projectLineDeniedCells,
} from './access-matrix';

const sections = Object.keys(PROFILE_SECTIONS) as ProfileSection[];
const audiences = Object.keys(PROFILE_AUDIENCES) as ProfileAudience[];

describe('access matrix', () => {
  it('covers every section and audience the spec defines', () => {
    expect(sections).toHaveLength(16);
    expect(audiences).toHaveLength(5);
    expect(matrixCells()).toHaveLength(sections.length * audiences.length);
  });

  it.each(sections)('%s has a cell for every audience', (section) => {
    for (const audience of audiences) {
      expect(ACCESS_MATRIX[section][audience]).toBeDefined();
    }
  });

  describe('spec rule 7 — a shared link never grants write access', () => {
    it.each(sections)('%s is not writable through a shared link', (section) => {
      expect(ACCESS_MATRIX[section].sharedLink.level).not.toBe('readWrite');
    });
  });

  describe('spec rule 3 — the colleague view is a whitelist', () => {
    const denied = sections.filter(
      (section) =>
        !(COLLEAGUE_WHITELIST as readonly ProfileSection[]).includes(section),
    );

    it.each(denied)('%s is absent for a colleague', (section) => {
      expect(ACCESS_MATRIX[section].colleague.level).toBe('none');
    });

    it.each(COLLEAGUE_WHITELIST)('%s is present for a colleague', (section) => {
      expect(ACCESS_MATRIX[section].colleague.level).not.toBe('none');
    });

    it('never grants a colleague write access', () => {
      for (const section of sections) {
        expect(ACCESS_MATRIX[section].colleague.level).not.toBe('readWrite');
      }
    });
  });

  describe('shared link defaults', () => {
    it('declares a default for every reachable shared-link section', () => {
      for (const section of sections) {
        const cell = ACCESS_MATRIX[section].sharedLink;
        if (cell.level === 'none') {
          expect(cell.sharedLinkDefault).toBeUndefined();
        } else {
          expect(cell.sharedLinkDefault).toBeDefined();
        }
      }
    });

    it('enables only the identity card by default', () => {
      const onByDefault = sections.filter(
        (section) =>
          ACCESS_MATRIX[section].sharedLink.sharedLinkDefault === 'on',
      );

      expect(onByDefault).toEqual(['S1']);
    });

    it('does not mark a default on non-shared-link audiences', () => {
      for (const { audience, cell } of matrixCells()) {
        if (audience !== 'sharedLink') {
          expect(cell.sharedLinkDefault).toBeUndefined();
        }
      }
    });
  });

  describe('documented exceptions stay attached to their cell', () => {
    it('keeps the PM read-only carve-out on management notes', () => {
      expect(ACCESS_MATRIX.S7.reportingLine.exception).toContain('PM');
    });

    it('keeps the S9 write narrowing on manager line', () => {
      expect(ACCESS_MATRIX.S9.reportingLine.exception).toContain('PP');
      expect(ACCESS_MATRIX.S9.reportingLine.exception).toContain('ProjectLine');
    });

    it('keeps the mentor-field rule on the colleague identity card', () => {
      expect(ACCESS_MATRIX.S1.colleague.exception).toContain('mentor');
    });
  });

  describe('coverage assertion', () => {
    it('reports every pair as missing when nothing is covered', () => {
      expect(missingMatrixCoverage([])).toHaveLength(
        sections.length * audiences.length,
      );
    });

    it('passes once every pair is covered', () => {
      expect(() => assertMatrixCoverage(matrixCells())).not.toThrow();
    });

    it('names the uncovered pair it rejects', () => {
      const allButOne = matrixCells().filter(
        (entry) => !(entry.section === 'S6' && entry.audience === 'colleague'),
      );

      expect(() => assertMatrixCoverage(allButOne)).toThrow(/S6\/colleague/);
    });
  });

  describe('Story 1.14 denied enumeration', () => {
    it('lists every level:none cell for self, colleague, and sharedLink', () => {
      const denied = deniedMatrixCells();
      expect(denied).toHaveLength(18);
      expect(
        denied.filter((cell) => cell.audience === 'self').map((c) => c.section),
      ).toEqual(['S6', 'S15']);
      expect(
        denied.filter((cell) => cell.audience === 'sharedLink').length,
      ).toBe(4);
    });

    it('declares ProjectLine AD-14 denial cells', () => {
      expect(projectLineDeniedCells()).toEqual([
        { section: 'S2', audience: 'projectLine', rule: 'profile-absent' },
        { section: 'S3', audience: 'projectLine', rule: 'profile-absent' },
        { section: 'S5', audience: 'projectLine', rule: 'payload-narrowed' },
      ]);
    });

    it('assertDeniedMatrixCoverage fails when a denial pair is missing', () => {
      const denied = deniedMatrixCells();
      const covered = denied.slice(1).map((cell) => ({
        kind: 'matrix' as const,
        section: cell.section,
        audience: cell.audience,
      }));

      expect(() => assertDeniedMatrixCoverage(covered)).toThrow(
        new RegExp(`${denied[0].section}/${denied[0].audience}`),
      );
    });

    it('enumerates only level:none cells, not granted unavailable sections', () => {
      const denied = deniedMatrixCells();
      expect(
        denied.some(
          (cell) => cell.section === 'S6' && cell.audience === 'reportingLine',
        ),
      ).toBe(false);
      expect(
        denied.some(
          (cell) => cell.section === 'S6' && cell.audience === 'colleague',
        ),
      ).toBe(true);
    });

    it('assertFlagGatedCoverage fails when a catalog case is missing', () => {
      const cases = flagGatedCases();
      const covered = cases.slice(1);

      expect(() => assertFlagGatedCoverage(covered)).toThrow(
        new RegExp(cases[0].section),
      );
    });

    it('exposes an explicit flag-gated catalog', () => {
      expect(flagGatedCases().length).toBe(10);
    });
  });
});
