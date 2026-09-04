import type { Response } from 'supertest';
import type { ProfileSection } from './access-matrix';

export interface ProfileBody {
  sections?: Record<string, unknown>;
}

/** Parallel routes with dedicated HTTP endpoints today (Story 1.14 inventory). */
export const PARALLEL_ROUTE_BY_SECTION: Partial<
  Record<ProfileSection, string>
> = {
  S6: '/risks',
  S7: '/management-notes',
  S9: '/timeline',
  S10: '/leaves',
};

export function expectSectionAbsentFromProfile(
  body: ProfileBody,
  sectionId: ProfileSection,
): void {
  expect(body.sections ?? {}).not.toHaveProperty(sectionId);
}

const PROJECT_LINE_S5_ALLOWED_TYPES = new Set(['cv', 'certificate']);

/** AD-14 S5: absent, unavailable (no provider), or CV/certificate-only payload. */
export function expectProjectLineS5NarrowedOrUnavailable(
  body: ProfileBody,
): void {
  const s5 = body.sections?.S5;
  if (s5 === undefined) {
    expect(body.sections ?? {}).not.toHaveProperty('S5');
    return;
  }

  if (
    typeof s5 === 'object' &&
    s5 !== null &&
    'status' in s5 &&
    (s5 as { status?: string }).status === 'unavailable'
  ) {
    return;
  }

  if (typeof s5 === 'object' && s5 !== null && 'data' in s5) {
    const documents =
      (
        s5 as {
          data?: {
            documents?: Array<{ documentType?: string; type?: string }>;
          };
        }
      ).data?.documents ?? [];

    for (const doc of documents) {
      const kind = (doc.documentType ?? doc.type ?? '').toLowerCase();
      expect(PROJECT_LINE_S5_ALLOWED_TYPES.has(kind)).toBe(true);
    }
  }
}

export async function expectParallelRouteDenied(
  agent: {
    get: (url: string) => { expect: (status: number) => Promise<Response> };
  },
  subjectEmployeeId: string,
  sectionId: ProfileSection,
): Promise<void> {
  const routeSuffix = PARALLEL_ROUTE_BY_SECTION[sectionId];
  if (!routeSuffix) {
    return;
  }

  await agent
    .get(`/api/v1/employees/${subjectEmployeeId}${routeSuffix}`)
    .expect(403);
}

export async function expectParallelRouteGranted(
  agent: {
    get: (url: string) => { expect: (status: number) => Promise<Response> };
  },
  subjectEmployeeId: string,
  sectionId: ProfileSection,
): Promise<void> {
  const routeSuffix = PARALLEL_ROUTE_BY_SECTION[sectionId];
  if (!routeSuffix) {
    return;
  }

  await agent
    .get(`/api/v1/employees/${subjectEmployeeId}${routeSuffix}`)
    .expect(200);
}
