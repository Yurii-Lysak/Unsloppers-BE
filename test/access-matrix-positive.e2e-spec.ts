import {
  matrixCells,
  MatrixCell,
  ProfileAudience,
} from './support/access-matrix';
import { createTestApp, TestApp } from './support/app-harness';
import { FixedClock, DEFAULT_TEST_INSTANT } from './support/fixed-clock';
import {
  matrixLeavesProviderOverride,
  MatrixActors,
  seedMatrixActors,
} from './support/matrix-actors';
import { recordMatrixCoverage } from './support/matrix-coverage-collector';
import { expectSectionAbsentFromProfile } from './support/matrix-leak-assertions';

function agentForAudience(
  actors: MatrixActors,
  audience: ProfileAudience,
): MatrixActors[keyof MatrixActors] {
  switch (audience) {
    case 'self':
      return actors.selfAgent;
    case 'reportingLine':
      return actors.reportingLineAgent;
    case 'pp':
      return actors.ppAgent;
    case 'colleague':
      return actors.colleagueAgent;
    default: {
      const _exhaustive: never = audience;
      throw new Error(`Unsupported C1 audience: ${String(_exhaustive)}`);
    }
  }
}

describe('Access matrix positive recording (e2e)', () => {
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

  describe.each(matrixCells().filter((cell) => cell.audience !== 'sharedLink'))(
    'C1 cell $section/$audience',
    (cell: MatrixCell) => {
      it('records coverage via profile API', async () => {
        const agent = agentForAudience(actors, cell.audience);
        const res = await (agent as typeof actors.selfAgent)
          .get(`/api/v1/employees/${actors.subjectEmployeeId}/profile`)
          .expect(200);

        if (cell.cell.level === 'none') {
          expectSectionAbsentFromProfile(res.body as never, cell.section);
        } else if (cell.cell.level !== 'perFieldVisibility') {
          const body = res.body as {
            sections: Record<string, { accessLevel?: string }>;
          };
          expect(body.sections[cell.section]).toBeDefined();
        }

        recordMatrixCoverage({
          section: cell.section,
          audience: cell.audience,
        });
      });
    },
  );
});
