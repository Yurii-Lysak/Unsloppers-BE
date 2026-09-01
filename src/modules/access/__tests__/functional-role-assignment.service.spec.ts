import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { FunctionalRoleAssignmentService } from '../functional-role-assignment.service';

describe('FunctionalRoleAssignmentService', () => {
  let service: FunctionalRoleAssignmentService;

  const prisma = {
    employee: {
      findUnique: jest.fn(),
    },
    functionalRole: {
      findUnique: jest.fn(),
    },
    functionalRoleAssignment: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

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
    prisma.functionalRoleAssignment.upsert.mockResolvedValue({
      id: 'assign-1',
    });

    await service.assign('emp-1', 'role-1');
    await service.assign('emp-1', 'role-1');

    expect(prisma.functionalRoleAssignment.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.functionalRoleAssignment.upsert).toHaveBeenCalledWith({
      where: { employeeId_roleId: { employeeId: 'emp-1', roleId: 'role-1' } },
      create: { employeeId: 'emp-1', roleId: 'role-1' },
      update: {},
    });
  });

  it('assign rejects unknown employees', async () => {
    prisma.employee.findUnique.mockResolvedValue(null);

    await expect(service.assign('missing', 'role-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('unassign removes an existing assignment', async () => {
    prisma.functionalRoleAssignment.findUnique.mockResolvedValue({
      id: 'assign-1',
    });
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
