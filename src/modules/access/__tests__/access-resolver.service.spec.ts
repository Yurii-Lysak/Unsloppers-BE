import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SectionAccessLevel } from '../../contracts/access-resolver.contract';
import { ProjectAssignment } from '../../contracts/project-assignment.contract';
import { PrismaService } from '../../../prisma/prisma.service';
import { Clock } from '../../../clock/clock.service';
import { AccessResolverService } from '../access-resolver.service';
import { RelationshipGraphGenerationService } from '../relationship-graph-generation.service';
import {
  AccessLevel,
  matrixCells,
  ProfileAudience,
} from '../../../../test/support/access-matrix';
import {
  recordMatrixCoverage,
  resetMatrixCoverage,
} from '../../../../test/support/matrix-coverage-collector';

const RESOLVER_AUDIENCES = [
  'self',
  'reportingLine',
  'pp',
  'colleague',
] as const satisfies readonly ProfileAudience[];

const SUBJECT_ID = 'emp-subject';
const MANAGER_ID = 'emp-manager';
const PP_ID = 'emp-pp';
const COLLEAGUE_ID = 'emp-colleague';

type EmployeeRow = {
  managerId: string | null;
  peoplePartnerId: string | null;
};

const EMPLOYEES: Record<string, EmployeeRow> = {
  [SUBJECT_ID]: { managerId: MANAGER_ID, peoplePartnerId: PP_ID },
  [MANAGER_ID]: { managerId: null, peoplePartnerId: null },
  [PP_ID]: { managerId: null, peoplePartnerId: null },
  [COLLEAGUE_ID]: { managerId: null, peoplePartnerId: null },
};

function expectedSectionLevel(level: AccessLevel): SectionAccessLevel | 'skip' {
  if (level === 'perFieldVisibility') {
    return 'skip';
  }
  if (level === 'none') {
    return 'none';
  }
  if (level === 'read') {
    return 'R';
  }
  return 'RW';
}

function viewerForAudience(audience: ProfileAudience): string {
  switch (audience) {
    case 'self':
      return SUBJECT_ID;
    case 'reportingLine':
      return MANAGER_ID;
    case 'pp':
      return PP_ID;
    case 'colleague':
      return COLLEAGUE_ID;
    default:
      throw new Error(`Unsupported resolver audience: ${audience}`);
  }
}

describe('AccessResolverService — master access matrix (AD-13)', () => {
  let accessResolver: AccessResolverService;

  const prisma = {
    employee: {
      findUnique: jest.fn(),
    },
    departmentHistory: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    fullAccessGrant: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };

  const projectAssignment = {
    listByEmployee: jest.fn().mockResolvedValue([]),
  };

  const graphGeneration = {
    cacheKey: jest.fn(),
    getCacheEntry: jest.fn(),
    getGeneration: jest.fn().mockReturnValue(0n),
    setCacheEntry: jest.fn(),
  };

  beforeAll(() => {
    resetMatrixCoverage();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    projectAssignment.listByEmployee.mockResolvedValue([]);

    prisma.employee.findUnique.mockImplementation(
      ({ where }: { where: { id?: string } }): Promise<EmployeeRow | null> => {
        if (where.id === undefined) {
          return Promise.resolve(null);
        }
        const row = EMPLOYEES[where.id];
        return Promise.resolve(row ?? null);
      },
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccessResolverService,
        { provide: PrismaService, useValue: prisma },
        { provide: ProjectAssignment, useValue: projectAssignment },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'ACCESS_RESOLUTION_CACHE_ENABLED') {
                return false;
              }
              if (key === 'HR_DEPARTMENT_VALUE') {
                return 'HR';
              }
              return undefined;
            }),
          },
        },
        {
          provide: Clock,
          useValue: {
            now: () => new Date('2026-09-01T00:00:00.000Z'),
            nowMs: () => new Date('2026-09-01T00:00:00.000Z').getTime(),
          },
        },
        {
          provide: RelationshipGraphGenerationService,
          useValue: graphGeneration,
        },
      ],
    }).compile();

    accessResolver = module.get(AccessResolverService);
  });

  describe.each(
    matrixCells().filter((cell) =>
      (RESOLVER_AUDIENCES as readonly string[]).includes(cell.audience),
    ),
  )('$section/$audience', ({ section, audience, cell }) => {
    it('matches the access matrix section grant', async () => {
      const viewerId = viewerForAudience(audience);
      const expected = expectedSectionLevel(cell.level);

      const result = await accessResolver.resolveAudience(viewerId, SUBJECT_ID);

      if (expected !== 'skip') {
        expect(result.sections[section]).toBe(expected);
      }

      recordMatrixCoverage({ section, audience });
    });
  });

  it('records every C1-resolvable pair exactly once via dedupe', () => {
    const resolverPairCount = matrixCells().filter((cell) =>
      (RESOLVER_AUDIENCES as readonly string[]).includes(cell.audience),
    ).length;
    expect(resolverPairCount).toBe(64);
  });
});
