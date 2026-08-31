import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BUILT_IN_ROLE_NAMES,
  PERMISSION_KEYS,
} from '../../contracts/permission-keys';
import { PrismaService } from '../../../prisma/prisma.service';
import { FunctionalRoleService } from '../functional-role.service';

describe('FunctionalRoleService', () => {
  let service: FunctionalRoleService;

  const prisma = {
    functionalRole: {
      findMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    functionalRolePermission: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (fn: (tx: typeof prisma) => unknown) => fn(prisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FunctionalRoleService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(FunctionalRoleService);
  });

  it('creates a custom role with zero permissions', async () => {
    prisma.functionalRole.findMany.mockResolvedValue([]);
    prisma.functionalRole.create.mockResolvedValue({
      id: 'role-1',
      name: 'Shell',
      isBuiltIn: false,
      permissions: [],
    });

    const result = await service.create('Shell', []);

    expect(result.permissionKeys).toEqual([]);
    expect(prisma.functionalRole.create).toHaveBeenCalled();
  });

  it('rejects empty role names', async () => {
    await expect(service.create('   ', [])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects unknown permission keys', async () => {
    prisma.functionalRole.findMany.mockResolvedValue([]);
    await expect(service.create('Bad', ['unknown_key'])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects duplicate names case-insensitively', async () => {
    prisma.functionalRole.findMany.mockResolvedValue([
      { id: 'existing', name: 'Security Champion' },
    ]);

    await expect(
      service.create('security champion', [
        PERMISSION_KEYS.CREATE_FORM_CAMPAIGNS,
      ]),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('blocks built-in role deletion', async () => {
    prisma.functionalRole.findUnique.mockResolvedValue({
      id: 'built-in',
      isBuiltIn: true,
      _count: { assignments: 0 },
    });

    await expect(service.delete('built-in')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('blocks deleting roles with assignments', async () => {
    prisma.functionalRole.findUnique.mockResolvedValue({
      id: 'custom',
      isBuiltIn: false,
      _count: { assignments: 2 },
    });

    await expect(service.delete('custom')).rejects.toThrow(
      'Cannot delete a role that still has 2 employee assignment(s)',
    );
  });

  it('blocks built-in rename', async () => {
    prisma.functionalRole.findUnique.mockResolvedValue({
      id: 'hr',
      name: BUILT_IN_ROLE_NAMES.HR_ADMIN,
      isBuiltIn: true,
      permissions: [{ permissionKey: PERMISSION_KEYS.MANAGE_FUNCTIONAL_ROLES }],
    });

    await expect(
      service.update('hr', { name: 'Renamed HR' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks HR Admin from losing manage_functional_roles', async () => {
    prisma.functionalRole.findUnique.mockResolvedValue({
      id: 'hr',
      name: BUILT_IN_ROLE_NAMES.HR_ADMIN,
      isBuiltIn: true,
      permissions: [{ permissionKey: PERMISSION_KEYS.MANAGE_FUNCTIONAL_ROLES }],
    });

    await expect(
      service.update('hr', {
        permissionKeys: [PERMISSION_KEYS.MANAGE_CUSTOM_FIELDS],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('replaces permissions atomically on PATCH', async () => {
    prisma.functionalRole.findUnique.mockResolvedValue({
      id: 'role-1',
      name: 'Security Champion',
      isBuiltIn: false,
      permissions: [{ permissionKey: PERMISSION_KEYS.CREATE_FORM_CAMPAIGNS }],
    });
    prisma.functionalRolePermission.deleteMany.mockResolvedValue({ count: 1 });
    prisma.functionalRolePermission.createMany.mockResolvedValue({ count: 1 });
    prisma.functionalRole.findUniqueOrThrow.mockResolvedValue({
      id: 'role-1',
      name: 'Security Champion',
      isBuiltIn: false,
      permissions: [{ permissionKey: PERMISSION_KEYS.CREATE_ACTION_ITEMS }],
    });

    const result = await service.update('role-1', {
      permissionKeys: [PERMISSION_KEYS.CREATE_ACTION_ITEMS],
    });

    expect(prisma.functionalRolePermission.deleteMany).toHaveBeenCalledWith({
      where: { roleId: 'role-1' },
    });
    expect(result.permissionKeys).toEqual([
      PERMISSION_KEYS.CREATE_ACTION_ITEMS,
    ]);
  });
});
