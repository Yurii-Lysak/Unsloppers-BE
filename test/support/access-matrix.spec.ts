import {
  ACCESS_MATRIX,
  assertMatrixCoverage,
  COLLEAGUE_WHITELIST,
  matrixCells,
  missingMatrixCoverage,
  PROFILE_AUDIENCES,
  PROFILE_SECTIONS,
  ProfileAudience,
  ProfileSection,
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
      expect(ACCESS_MATRIX.S7.managerLine.exception).toContain('PM');
    });

    it('keeps the S9 write narrowing on manager line', () => {
      expect(ACCESS_MATRIX.S9.managerLine.exception).toContain('PP');
      expect(ACCESS_MATRIX.S9.managerLine.exception).toContain('ProjectLine');
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
});
