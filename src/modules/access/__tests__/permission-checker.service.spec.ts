import { Test, TestingModule } from '@nestjs/testing';
import { PERMISSION_KEYS } from '../../contracts/permission-keys';
import { PrismaService } from '../../../prisma/prisma.service';
import { PermissionCheckerService } from '../permission-checker.service';

describe('PermissionCheckerService', () => {
  let service: PermissionCheckerService;

  const prisma = {
    employee: {
      findUnique: jest.fn(),
    },
    functionalRoleAssignment: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionCheckerService,
        { provide: PrismaService, useValue: prisma },
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
});
