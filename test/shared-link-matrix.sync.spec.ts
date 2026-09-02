import {
  ACCESS_MATRIX,
  PROFILE_SECTIONS,
  ProfileSection,
} from './support/access-matrix';
import {
  SHARED_LINK_CFG_SECTIONS,
  SHARED_LINK_DEFAULT_SECTIONS,
  SHARED_LINK_NEVER_SECTIONS,
} from '../src/modules/access/shared-link-matrix';

const sections = Object.keys(PROFILE_SECTIONS) as ProfileSection[];

describe('shared-link-matrix sync with access-matrix', () => {
  it('never sections match access-matrix sharedLink none cells', () => {
    const expectedNever = sections.filter(
      (section) => ACCESS_MATRIX[section].sharedLink.level === 'none',
    );
    expect([...SHARED_LINK_NEVER_SECTIONS].sort()).toEqual(
      expectedNever.sort(),
    );
  });

  it('default-on sections match access-matrix sharedLinkDefault on', () => {
    const expectedDefaults = sections.filter(
      (section) => ACCESS_MATRIX[section].sharedLink.sharedLinkDefault === 'on',
    );
    expect([...SHARED_LINK_DEFAULT_SECTIONS].sort()).toEqual(
      expectedDefaults.sort(),
    );
  });

  it('cfg sections match reachable shared-link sections with default off', () => {
    const expectedCfg = sections.filter(
      (section) =>
        ACCESS_MATRIX[section].sharedLink.level !== 'none' &&
        ACCESS_MATRIX[section].sharedLink.sharedLinkDefault === 'off',
    );
    expect([...SHARED_LINK_CFG_SECTIONS].sort()).toEqual(expectedCfg.sort());
  });
});
