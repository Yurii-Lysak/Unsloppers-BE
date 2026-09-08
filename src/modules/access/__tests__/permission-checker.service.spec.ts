import { Test, TestingModule } from '@nestjs/testing';
import { PERMISSION_KEYS } from '../../contracts/permission-keys';
import { PrismaService } from '../../../prisma/prisma.service';
import { Clock } from '../../../clock/clock.service';
import { PermissionCheckerService } from '../permission-checker.service';
import {
  DEFAULT_TEST_INSTANT,
  FixedClock,
} from '../../../../test/support/fixed-clock';

interface EmployeeCountWhere {
  managerId?: string;
  peoplePartnerId?: string;
}

describe('PermissionCheckerService', () => {
  let service: PermissionCheckerService;

  const prisma = {
    employee: {
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    functionalRoleAssignment: {
      findMany: jest.fn(),
    },
    projectAssignment: {
      count: jest.fn(),
    },
  };

  const setNoManagerOrPpDefaultAccess = () => {
    prisma.employee.count.mockResolvedValue(0);
    prisma.projectAssignment.count.mockResolvedValue(0);
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    setNoManagerOrPpDefaultAccess();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionCheckerService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: Clock,
          useValue: new FixedClock(DEFAULT_TEST_INSTANT),
        },
      ],
    }).compile();

    service = module.get(PermissionCheckerService);
  });

  it('denies when user has no employee row', async () => {
    prisma.employee.findUnique.mockResolvedValue(null);

    await expect(
      service.hasPermission('user-1', PERMISSION_KEYS.CREATE_FORM_CAMPAIGNS),
    ).resolves.toBe(false);
  });

  it('denies unknown permission keys', async () => {
    prisma.employee.findUnique.mockResolvedValue({ id: 'emp-1' });
    prisma.functionalRoleAssignment.findMany.mockResolvedValue([]);

    await expect(
      service.hasPermission('user-1', 'not-a-real-key'),
    ).resolves.toBe(false);
  });

  it('unions permissions across multiple role assignments', async () => {
    prisma.employee.findUnique.mockResolvedValue({ id: 'emp-1' });
    prisma.functionalRoleAssignment.findMany.mockResolvedValue([
      {
        role: {
          permissions: [
            { permissionKey: PERMISSION_KEYS.CREATE_FORM_CAMPAIGNS },
          ],
        },
      },
      {
        role: {
          permissions: [{ permissionKey: PERMISSION_KEYS.CREATE_ACTION_ITEMS }],
        },
      },
    ]);

    await expect(
      service.hasPermission('user-1', PERMISSION_KEYS.CREATE_FORM_CAMPAIGNS),
    ).resolves.toBe(true);
    await expect(
      service.hasPermission('user-1', PERMISSION_KEYS.CREATE_ACTION_ITEMS),
    ).resolves.toBe(true);
    await expect(
      service.hasPermission('user-1', PERMISSION_KEYS.MANAGE_DEPARTMENTS),
    ).resolves.toBe(false);
  });

  it('ignores orphan permission keys not in the catalog', async () => {
    prisma.employee.findUnique.mockResolvedValue({ id: 'emp-1' });
    prisma.functionalRoleAssignment.findMany.mockResolvedValue([
      {
        role: {
          permissions: [{ permissionKey: 'retired_permission' }],
        },
      },
    ]);

    await expect(
      service.hasPermission('user-1', 'retired_permission'),
    ).resolves.toBe(false);
  });

  it('getGrantedPermissions returns sorted catalog-valid keys', async () => {
    prisma.employee.findUnique.mockResolvedValue({ id: 'emp-1' });
    prisma.functionalRoleAssignment.findMany.mockResolvedValue([
      {
        role: {
          permissions: [
            { permissionKey: PERMISSION_KEYS.CREATE_ACTION_ITEMS },
            { permissionKey: PERMISSION_KEYS.CREATE_FORM_CAMPAIGNS },
            { permissionKey: 'retired_permission' },
          ],
        },
      },
    ]);

    await expect(service.getGrantedPermissions('user-1')).resolves.toEqual([
      PERMISSION_KEYS.CREATE_ACTION_ITEMS,
      PERMISSION_KEYS.CREATE_FORM_CAMPAIGNS,
    ]);
  });

  it('reflects permission removal on the next call', async () => {
    prisma.employee.findUnique.mockResolvedValue({ id: 'emp-1' });
    prisma.functionalRoleAssignment.findMany
      .mockResolvedValueOnce([
        {
          role: {
            permissions: [
              { permissionKey: PERMISSION_KEYS.CREATE_FORM_CAMPAIGNS },
            ],
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          role: {
            permissions: [],
          },
        },
      ]);

    await expect(
      service.hasPermission('user-1', PERMISSION_KEYS.CREATE_FORM_CAMPAIGNS),
    ).resolves.toBe(true);
    await expect(
      service.hasPermission('user-1', PERMISSION_KEYS.CREATE_FORM_CAMPAIGNS),
    ).resolves.toBe(false);
  });

  describe('manager/PP widening for CREATE_FORM_CAMPAIGNS (spec-10-1)', () => {
    it('grants CREATE_FORM_CAMPAIGNS to a manager with >=1 direct report and no role assignments', async () => {
      prisma.employee.findUnique.mockResolvedValue({ id: 'emp-1' });
      prisma.functionalRoleAssignment.findMany.mockResolvedValue([]);
      prisma.employee.count.mockImplementation(
        ({ where }: { where: EmployeeCountWhere }) =>
          Promise.resolve(where.managerId === 'emp-1' ? 1 : 0),
      );

      await expect(
        service.hasPermission('user-1', PERMISSION_KEYS.CREATE_FORM_CAMPAIGNS),
      ).resolves.toBe(true);
      await expect(
        service.hasPermission('user-1', PERMISSION_KEYS.CREATE_ACTION_ITEMS),
      ).resolves.toBe(false);
    });

    it('grants CREATE_FORM_CAMPAIGNS to a PP with >=1 assignee and no role assignments', async () => {
      prisma.employee.findUnique.mockResolvedValue({ id: 'emp-1' });
      prisma.functionalRoleAssignment.findMany.mockResolvedValue([]);
      prisma.employee.count.mockImplementation(
        ({ where }: { where: EmployeeCountWhere }) =>
          Promise.resolve(where.peoplePartnerId === 'emp-1' ? 1 : 0),
      );

      await expect(
        service.hasPermission('user-1', PERMISSION_KEYS.CREATE_FORM_CAMPAIGNS),
      ).resolves.toBe(true);
    });

    it('grants CREATE_FORM_CAMPAIGNS via an active PM/DM ProjectAssignment', async () => {
      prisma.employee.findUnique.mockResolvedValue({ id: 'emp-1' });
      prisma.functionalRoleAssignment.findMany.mockResolvedValue([]);
      prisma.projectAssignment.count.mockResolvedValue(1);

      await expect(
        service.hasPermission('user-1', PERMISSION_KEYS.CREATE_FORM_CAMPAIGNS),
      ).resolves.toBe(true);
    });

    it('scopes the ProjectAssignment query to still-active rows (endDate null or >= today)', async () => {
      prisma.employee.findUnique.mockResolvedValue({ id: 'emp-1' });
      prisma.functionalRoleAssignment.findMany.mockResolvedValue([]);

      await service.hasPermission(
        'user-1',
        PERMISSION_KEYS.CREATE_FORM_CAMPAIGNS,
      );

      expect(prisma.projectAssignment.count).toHaveBeenCalledWith({
        where: {
          AND: [
            { OR: [{ pmId: 'emp-1' }, { dmId: 'emp-1' }] },
            {
              OR: [
                { endDate: null },
                { endDate: { gte: new Date('2026-01-05T00:00:00.000Z') } },
              ],
            },
          ],
        },
      });
    });

    it('does not grant CREATE_FORM_CAMPAIGNS when no manager/PP/role source applies', async () => {
      prisma.employee.findUnique.mockResolvedValue({ id: 'emp-1' });
      prisma.functionalRoleAssignment.findMany.mockResolvedValue([]);

      await expect(
        service.hasPermission('user-1', PERMISSION_KEYS.CREATE_FORM_CAMPAIGNS),
      ).resolves.toBe(false);
    });

    it('never widens any permission key other than CREATE_FORM_CAMPAIGNS', async () => {
      prisma.employee.findUnique.mockResolvedValue({ id: 'emp-1' });
      prisma.functionalRoleAssignment.findMany.mockResolvedValue([]);
      prisma.employee.count.mockImplementation(
        ({ where }: { where: EmployeeCountWhere }) =>
          Promise.resolve(where.managerId === 'emp-1' ? 1 : 0),
      );

      await expect(service.getGrantedPermissions('user-1')).resolves.toEqual([
        PERMISSION_KEYS.CREATE_FORM_CAMPAIGNS,
      ]);
    });
  });
});
