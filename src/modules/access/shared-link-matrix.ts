import type { SectionId } from '../contracts/access-resolver.contract';

/** Sections that can never appear on a shared link (access-model + SPEC). */
export const SHARED_LINK_NEVER_SECTIONS: readonly SectionId[] = [
  'S3',
  'S7',
  'S13',
  'S14',
] as const;

/** Sections enabled when the client omits `sections` (S1 on by default). */
export const SHARED_LINK_DEFAULT_SECTIONS: readonly SectionId[] = [
  'S1',
] as const;

/** `cfg` sections a creator may opt into via the Shared Link Manager. */
export const SHARED_LINK_CFG_SECTIONS: readonly SectionId[] = [
  'S2',
  'S4',
  'S5',
  'S6',
  'S8',
  'S9',
  'S10',
  'S11',
  'S12',
  'S15',
  'S16',
] as const;

const ALL_SECTION_IDS: SectionId[] = [
  'S1',
  'S2',
  'S3',
  'S4',
  'S5',
  'S6',
  'S7',
  'S8',
  'S9',
  'S10',
  'S11',
  'S12',
  'S13',
  'S14',
  'S15',
  'S16',
];

export function isSharedLinkNeverSection(sectionId: SectionId): boolean {
  return (SHARED_LINK_NEVER_SECTIONS as readonly string[]).includes(sectionId);
}

export function isValidSectionId(value: string): value is SectionId {
  return (ALL_SECTION_IDS as readonly string[]).includes(value);
}

export function getSharedLinkDefaultSections(): SectionId[] {
  return [...SHARED_LINK_DEFAULT_SECTIONS];
}

export function listShareableCfgSections(): SectionId[] {
  return [...SHARED_LINK_CFG_SECTIONS];
}

export function assertNoDuplicateSections(sections: SectionId[]): void {
  const seen = new Set<string>();
  for (const section of sections) {
    if (seen.has(section)) {
      throw new Error(`Duplicate section id: ${section}`);
    }
    seen.add(section);
  }
}

/** 32-byte opaque token encoded as base64url (43 characters, no padding). */
export const SHARED_LINK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isValidSharedLinkToken(token: string): boolean {
  return SHARED_LINK_TOKEN_PATTERN.test(token);
}
