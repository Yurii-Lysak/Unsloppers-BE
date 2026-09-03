import {
  assertDeniedMatrixCoverage,
  deniedMatrixCells,
  DeniedMatrixCell,
  projectLineDeniedCells,
  ProjectLineDeniedCell,
} from './support/access-matrix';
import { createTestApp, TestApp } from './support/app-harness';
import { FixedClock, DEFAULT_TEST_INSTANT } from './support/fixed-clock';
import {
  getRecordedDeniedPairs,
  recordDeniedCoverage,
  resetDeniedCoverage,
} from './support/matrix-coverage-collector';
import {
  expectParallelRouteDenied,
  expectProjectLineS5NarrowedOrUnavailable,
  expectSectionAbsentFromProfile,
  PARALLEL_ROUTE_BY_SECTION,
} from './support/matrix-leak-assertions';
import {
  loginMatrixAgent,
  matrixLeavesProviderOverride,
  MATRIX_DM_EMAIL,
  MatrixActors,
  seedMatrixActors,
} from './support/matrix-actors';

/** Shareable cfg sections for shared-link consume (never-sections omitted). */
const SHARED_LINK_CONSUME_SECTIONS = ['S2', 'S9', 'S10', 'S11'] as const;

describe('Access matrix leak harness (e2e)', () => {
  let testApp: TestApp;
  let actors: MatrixActors;

  beforeAll(async () => {
    resetDeniedCoverage();
    testApp = await createTestApp({
      clock: new FixedClock(DEFAULT_TEST_INSTANT),
      providerOverrides: [matrixLeavesProviderOverride],
    });
    actors = await seedMatrixActors(testApp);
  });

  afterAll(async () => {
    assertDeniedMatrixCoverage(getRecordedDeniedPairs());
    await testApp.close();
  });

  describe.each(deniedMatrixCells())(
    'denied cell $section/$audience',
    (cell: DeniedMatrixCell) => {
      it('keeps the section absent on every applicable surface', async () => {
        const { subjectEmployeeId } = actors;

        if (cell.audience === 'self') {
          const res = await actors.selfAgent
            .get(`/api/v1/employees/${subjectEmployeeId}/profile`)
            .expect(200);
          expectSectionAbsentFromProfile(res.body as never, cell.section);
          recordDeniedCoverage({
            kind: 'matrix',
            section: cell.section,
            audience: cell.audience,
          });
          return;
        }

        if (cell.audience === 'colleague') {
          const res = await actors.colleagueAgent
            .get(`/api/v1/employees/${subjectEmployeeId}/profile`)
            .expect(200);
          expectSectionAbsentFromProfile(res.body as never, cell.section);

          if (PARALLEL_ROUTE_BY_SECTION[cell.section]) {
            await expectParallelRouteDenied(
              actors.colleagueAgent,
              subjectEmployeeId,
              cell.section,
            );
          }

          recordDeniedCoverage({
            kind: 'matrix',
            section: cell.section,
            audience: cell.audience,
          });
          return;
        }

        if (cell.audience === 'sharedLink') {
          const createRes = await actors.reportingLineAgent
            .post(`/api/v1/employees/${subjectEmployeeId}/shared-links`)
            .send({
              recipientEmployeeId: actors.dmEmployeeId,
              sections: [...SHARED_LINK_CONSUME_SECTIONS],
            })
            .expect(201);

          const { token } = createRes.body as { token: string };
          expect(token).toBeDefined();
          const recipientAgent = await loginMatrixAgent(
            testApp,
            MATRIX_DM_EMAIL,
          );
          const profileRes = await recipientAgent
            .get(`/api/v1/shared-links/${token}/profile`)
            .expect(200);

          expectSectionAbsentFromProfile(
            profileRes.body as never,
            cell.section,
          );
          recordDeniedCoverage({
            kind: 'matrix',
            section: cell.section,
            audience: cell.audience,
          });
        }
      });
    },
  );

  describe.each(projectLineDeniedCells())(
    'ProjectLine denial $section/$rule',
    (cell: ProjectLineDeniedCell) => {
      it('enforces AD-14 narrowing on the profile API', async () => {
        const res = await actors.projectLineDmAgent
          .get(`/api/v1/employees/${actors.subjectEmployeeId}/profile`)
          .expect(200);

        if (cell.rule === 'profile-absent') {
          expectSectionAbsentFromProfile(res.body as never, cell.section);
        } else if (cell.section === 'S5') {
          expectProjectLineS5NarrowedOrUnavailable(res.body as never);
        } else {
          expect(res.body).toHaveProperty('sections');
        }

        recordDeniedCoverage({
          kind: 'projectLine',
          section: cell.section,
          rule: cell.rule,
        });
      });
    },
  );

  it('returns 403 when an authenticated user has no employee record', async () => {
    const agent = await loginMatrixAgent(
      testApp,
      'matrix-no-employee@example.com',
    );
    await agent
      .get(`/api/v1/employees/${actors.subjectEmployeeId}/profile`)
      .expect(403);
    await agent
      .get(`/api/v1/employees/${actors.subjectEmployeeId}/timeline`)
      .expect(403);
  });

  it('grants Colleague access to the leaves parallel route with dates-only payload', async () => {
    const res = await actors.colleagueAgent
      .get(`/api/v1/employees/${actors.subjectEmployeeId}/leaves`)
      .expect(200);

    const leaves = (
      res.body as {
        leaves?: Array<{ type: string | null; approvalState: string | null }>;
      }
    ).leaves;
    expect(leaves?.[0]?.type).toBeNull();
    expect(leaves?.[0]?.approvalState).toBeNull();
  });
});

describe('Shared link never-section consume (e2e)', () => {
  let testApp: TestApp;
  let actors: MatrixActors;

  beforeAll(async () => {
    testApp = await createTestApp({
      clock: new FixedClock(DEFAULT_TEST_INSTANT),
      providerOverrides: [matrixLeavesProviderOverride],
    });
    actors = await seedMatrixActors(testApp);
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('omits never sections from a DM-recipient S1+S9 link consume response', async () => {
    const createRes = await actors.reportingLineAgent
      .post(`/api/v1/employees/${actors.subjectEmployeeId}/shared-links`)
      .send({
        recipientEmployeeId: actors.dmEmployeeId,
        sections: ['S9'],
      })
      .expect(201);

    const { token } = createRes.body as { token: string };
    const recipientAgent = await loginMatrixAgent(testApp, MATRIX_DM_EMAIL);
    const profileRes = await recipientAgent
      .get(`/api/v1/shared-links/${token}/profile`)
      .expect(200);

    const body = profileRes.body as {
      sections: Record<string, unknown>;
    };
    expect(Object.keys(body.sections).sort()).toEqual(['S1', 'S9']);
    for (const forbidden of ['S3', 'S7', 'S13', 'S14'] as const) {
      expect(body.sections).not.toHaveProperty(forbidden);
    }
  });

  it('rejects create when sections include never-shareable ids', async () => {
    for (const section of ['S3', 'S7', 'S13', 'S14'] as const) {
      await actors.reportingLineAgent
        .post(`/api/v1/employees/${actors.subjectEmployeeId}/shared-links`)
        .send({
          recipientEmployeeId: actors.dmEmployeeId,
          sections: [section],
        })
        .expect(400);
    }
  });
});
