import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PERMISSION_KEYS } from '../../contracts/permission-keys';
import { ProjectAssignment } from '../../contracts/project-assignment.contract';
import { PrismaService } from '../../../prisma/prisma.service';
import { Clock } from '../../../clock/clock.service';
import { PermissionCheckerService } from '../permission-checker.service';
import { AccessResolverService } from '../access-resolver.service';
import { RelationshipGraphGenerationService } from '../relationship-graph-generation.service';

describe('Functional role data-access boundary', () => {
  let permissionChecker: PermissionCheckerService;
  let accessResolver: AccessResolverService;

  const prisma = {
    employee: {
      findUnique: jest.fn(),
    },
    functionalRoleAssignment: {
      findMany: jest.fn(),
    },
    departmentHistory: {
      findFirst: jest.fn(),
    },
    fullAccessGrant: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };

  const projectAssignment = {
    listByEmployee: jest.fn().mockResolvedValue([]),
  };

  const configService = {
    get: jest.fn().mockReturnValue('HR'),
  };

  const clock = {
    now: jest.fn().mockReturnValue(new Date('2026-09-01T00:00:00.000Z')),
    nowMs: jest
      .fn()
      .mockReturnValue(new Date('2026-09-01T00:00:00.000Z').getTime()),
  };

  const graphGeneration = {
    cacheKey: jest.fn(),
    getCacheEntry: jest.fn(),
    getGeneration: jest.fn().mockReturnValue(0n),
    setCacheEntry: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    projectAssignment.listByEmployee.mockResolvedValue([]);

    prisma.employee.findUnique.mockImplementation(
      ({ where }: { where: { id?: string; userId?: string } }) => {
        if (where.userId === 'viewer-user') {
          return Promise.resolve({ id: 'viewer-emp' });
        }
        if (where.id === 'subject-emp') {
          return Promise.resolve({ managerId: null, peoplePartnerId: null });
        }
        if (where.id === 'viewer-emp') {
          return Promise.resolve({ managerId: null });
        }
        return Promise.resolve(null);
      },
    );

    prisma.functionalRoleAssignment.findMany.mockResolvedValue([
      {
        role: {
          permissions: [{ permissionKey: PERMISSION_KEYS.CREATE_EDIT_RISKS }],
        },
      },
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionCheckerService,
        AccessResolverService,
        { provide: PrismaService, useValue: prisma },
        { provide: ProjectAssignment, useValue: projectAssignment },
        { provide: ConfigService, useValue: configService },
        { provide: Clock, useValue: clock },
        {
          provide: RelationshipGraphGenerationService,
          useValue: graphGeneration,
        },
      ],
    }).compile();

    permissionChecker = module.get(PermissionCheckerService);
    accessResolver = module.get(AccessResolverService);
  });

  it('grants feature permission without widening C1 section access', async () => {
    await expect(
      permissionChecker.hasPermission(
        'viewer-user',
        PERMISSION_KEYS.CREATE_EDIT_RISKS,
      ),
    ).resolves.toBe(true);

    const audience = await accessResolver.resolveAudience(
      'viewer-emp',
      'subject-emp',
    );

    expect(audience.role).toBe('Colleague');
    expect(audience.sections.S6).toBe('none');
  });
});
