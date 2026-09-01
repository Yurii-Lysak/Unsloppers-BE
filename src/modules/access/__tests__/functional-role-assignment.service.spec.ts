import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PERMISSION_KEYS } from '../../contracts/permission-keys';
import { PrismaService } from '../../../prisma/prisma.service';
import { FunctionalRoleAssignmentService } from '../functional-role-assignment.service';

describe('FunctionalRoleAssignmentService', () => {
  let service: FunctionalRoleAssignmentService;

  const tx = {
    functionalRole: {
      findMany: jest.fn(),
    },
    functionalRoleAssignment: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
  };

  const prisma = {
    employee: {
      findUnique: jest.fn(),
    },
    functionalRole: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    functionalRoleAssignment: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.functionalRole.findMany.mockResolvedValue([]);
    prisma.functionalRoleAssignment.findMany.mockResolvedValue([]);
    prisma.functionalRoleAssignment.count.mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FunctionalRoleAssignmentService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(FunctionalRoleAssignmentService);
  });

  it('assign is idempotent for the same employee/role pair', async () => {
    prisma.employee.findUnique.mockResolvedValue({ id: 'emp-1' });
    prisma.functionalRole.findUnique.mockResolvedValue({ id: 'role-1' });
    prisma.functionalRoleAssignment.findMany.mockResolvedValue([]);
    prisma.functionalRoleAssignment.upsert.mockResolvedValue({
      id: 'assign-1',
    });

    await service.assign('emp-1', 'role-1');
    await service.assign('emp-1', 'role-1');

    expect(prisma.functionalRoleAssignment.upsert).toHaveBeenCalledTimes(2);
  });

  it('assign rejects unknown employees', async () => {
    prisma.employee.findUnique.mockResolvedValue(null);

    await expect(service.assign('missing', 'role-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('setAssignments rejects unknown employees', async () => {
    prisma.employee.findUnique.mockResolvedValue(null);

    await expect(
      service.setAssignments('missing', ['role-1']),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('setAssignments dedupes duplicate roleIds before diffing', async () => {
    prisma.employee.findUnique.mockResolvedValue({ id: 'emp-1' });
    tx.functionalRole.findMany.mockResolvedValue([{ id: 'role-1' }]);
    tx.functionalRoleAssignment.findMany.mockResolvedValue([]);
    tx.functionalRoleAssignment.create.mockResolvedValue({});
    prisma.functionalRoleAssignment.findMany.mockResolvedValue([]);

    await service.setAssignments('emp-1', ['role-1', 'role-1']);

    expect(tx.functionalRoleAssignment.create).toHaveBeenCalledTimes(1);
    expect(tx.functionalRoleAssignment.create).toHaveBeenCalledWith({
      data: { employeeId: 'emp-1', roleId: 'role-1' },
    });
  });

  it('setAssignments is idempotent when the same roleIds are submitted twice', async () => {
    prisma.employee.findUnique.mockResolvedValue({ id: 'emp-1' });
    tx.functionalRole.findMany.mockResolvedValue([{ id: 'role-1' }]);
    tx.functionalRoleAssignment.findMany.mockResolvedValue([
      { roleId: 'role-1' },
    ]);
    prisma.functionalRoleAssignment.findMany.mockResolvedValue([
      {
        role: {
          id: 'role-1',
          name: 'Campaign Sender',
          isBuiltIn: false,
          permissions: [
            { permissionKey: PERMISSION_KEYS.CREATE_FORM_CAMPAIGNS },
          ],
        },
      },
    ]);

    await service.setAssignments('emp-1', ['role-1']);
    await service.setAssignments('emp-1', ['role-1']);

    expect(tx.functionalRoleAssignment.create).not.toHaveBeenCalled();
    expect(tx.functionalRoleAssignment.deleteMany).not.toHaveBeenCalled();
  });

  it('setAssignments rejects unknown roles', async () => {
    prisma.employee.findUnique.mockResolvedValue({ id: 'emp-1' });
    tx.functionalRole.findMany.mockResolvedValue([]);

    await expect(
      service.setAssignments('emp-1', ['role-missing']),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('setAssignments rejects removing the last manage_functional_roles holder', async () => {
    prisma.employee.findUnique.mockResolvedValue({ id: 'emp-admin' });
    prisma.functionalRole.findMany.mockResolvedValue([{ id: 'role-admin' }]);
    prisma.functionalRoleAssignment.findMany.mockResolvedValue([
      { employeeId: 'emp-admin' },
    ]);

    await expect(
      service.setAssignments('emp-admin', [], { callerUserId: 'user-admin' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('setAssignments rejects self-granting manage_functional_roles without already holding it', async () => {
    prisma.employee.findUnique.mockImplementation(
      ({ where }: { where: { id?: string; userId?: string } }) => {
        if (where.userId === 'user-1') {
          return Promise.resolve({ id: 'emp-1' });
        }
        if (where.id === 'emp-1') {
          return Promise.resolve({ id: 'emp-1' });
        }
        return Promise.resolve(null);
      },
    );
    prisma.functionalRole.findMany.mockResolvedValue([{ id: 'role-admin' }]);
    prisma.functionalRoleAssignment.findMany.mockResolvedValue([]);
    prisma.functionalRoleAssignment.count.mockResolvedValue(0);

    await expect(
      service.setAssignments('emp-1', ['role-admin'], {
        callerUserId: 'user-1',
      }),
    ).rejects.toThrow(
      'Cannot grant manage_functional_roles to yourself without already holding it',
    );
  });

  it('listForEmployee maps assigned roles and filters retired permission keys', async () => {
    prisma.employee.findUnique.mockResolvedValue({ id: 'emp-1' });
    prisma.functionalRoleAssignment.findMany.mockResolvedValue([
      {
        role: {
          id: 'role-1',
          name: 'Campaign Sender',
          isBuiltIn: false,
          permissions: [
            { permissionKey: PERMISSION_KEYS.CREATE_FORM_CAMPAIGNS },
            { permissionKey: 'retired_permission' },
          ],
        },
      },
    ]);

    await expect(service.listForEmployee('emp-1')).resolves.toEqual([
      {
        id: 'role-1',
        name: 'Campaign Sender',
        isBuiltIn: false,
        permissionKeys: [PERMISSION_KEYS.CREATE_FORM_CAMPAIGNS],
      },
    ]);
  });

  it('unassign removes an existing assignment', async () => {
    prisma.functionalRoleAssignment.findUnique.mockResolvedValue({
      id: 'assign-1',
    });
    prisma.functionalRoleAssignment.findMany.mockResolvedValue([
      { roleId: 'role-1' },
    ]);
    prisma.functionalRoleAssignment.delete.mockResolvedValue({
      id: 'assign-1',
    });

    await service.unassign('emp-1', 'role-1');

    expect(prisma.functionalRoleAssignment.delete).toHaveBeenCalledWith({
      where: { id: 'assign-1' },
    });
  });

  it('unassign rejects unknown pairs', async () => {
    prisma.functionalRoleAssignment.findUnique.mockResolvedValue(null);

    await expect(service.unassign('emp-1', 'role-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
