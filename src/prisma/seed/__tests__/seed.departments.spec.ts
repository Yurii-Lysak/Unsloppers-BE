import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { seedDepartments } from '../seed.departments';
import { DepartmentSeedHaltError } from '../seed.errors';
import { BUILT_IN_ROLE_NAMES } from '../../../modules/contracts/permission-keys';
import { FunctionalRoleAssignmentService } from '../../../modules/access/functional-role-assignment.service';

const silentLogger: Pick<Logger, 'log' | 'warn'> = {
  log: jest.fn(),
  warn: jest.fn(),
};

function makeDeps(
  historyRows: { value: string; employeeId: string; effectiveFrom: Date }[],
  unitManagerRoleId: string | null = 'role-um',
) {
  const departmentsByName = new Map<
    string,
    {
      id: string;
      name: string;
      parentId: string | null;
      managerId: string | null;
    }
  >();
  let autoId = 0;

  const departmentHistoryFindMany = jest.fn(() => Promise.resolve(historyRows));
  const functionalRoleFindFirst = jest.fn(() =>
    Promise.resolve(
      unitManagerRoleId
        ? { id: unitManagerRoleId, name: BUILT_IN_ROLE_NAMES.UNIT_MANAGER }
        : null,
    ),
  );
  const departmentFindUnique = jest.fn(
    ({ where }: { where: { name: string } }) =>
      Promise.resolve(departmentsByName.get(where.name) ?? null),
  );
  const departmentCreate = jest.fn(
    ({ data }: { data: { name: string; managerId: string | null } }) => {
      autoId += 1;
      const row = {
        id: `dept-${autoId}`,
        name: data.name,
        parentId: null,
        managerId: data.managerId,
      };
      departmentsByName.set(data.name, row);
      return Promise.resolve(row);
    },
  );
  const departmentUpdate = jest.fn(
    ({
      where,
      data,
    }: {
      where: { id: string };
      data: { managerId: string | null };
    }) => {
      const row = [...departmentsByName.values()].find(
        (candidate) => candidate.id === where.id,
      );
      if (row) {
        row.managerId = data.managerId;
      }
      return Promise.resolve(row);
    },
  );

  const prisma = {
    departmentHistory: { findMany: departmentHistoryFindMany },
    functionalRole: { findFirst: functionalRoleFindFirst },
    department: {
      findUnique: departmentFindUnique,
      create: departmentCreate,
      update: departmentUpdate,
    },
  } as unknown as PrismaService;

  const assign = jest.fn(() => Promise.resolve());
  const assignmentService = {
    assign,
  } as unknown as FunctionalRoleAssignmentService;

  return {
    prisma,
    assignmentService,
    departmentsByName,
    assign,
    departmentCreate,
    departmentUpdate,
  };
}

describe('seedDepartments', () => {
  it('creates one Department per distinct current department value', async () => {
    const { prisma, assignmentService, departmentsByName } = makeDeps([
      {
        value: 'Engineering',
        employeeId: 'emp-1',
        effectiveFrom: new Date('2024-01-01'),
      },
      {
        value: 'Design',
        employeeId: 'emp-2',
        effectiveFrom: new Date('2024-06-01'),
      },
    ]);

    const summary = await seedDepartments(
      prisma,
      assignmentService,
      silentLogger,
    );

    expect(summary.departmentsUpserted).toBe(2);
    expect([...departmentsByName.keys()].sort()).toEqual([
      'Design',
      'Engineering',
    ]);
  });

  it('picks the employee with the earliest effectiveFrom as the department manager', async () => {
    const { prisma, assignmentService, departmentsByName, assign } = makeDeps([
      {
        value: 'Engineering',
        employeeId: 'emp-late',
        effectiveFrom: new Date('2025-01-01'),
      },
      {
        value: 'Engineering',
        employeeId: 'emp-early',
        effectiveFrom: new Date('2023-01-01'),
      },
    ]);

    const summary = await seedDepartments(
      prisma,
      assignmentService,
      silentLogger,
    );

    expect(departmentsByName.get('Engineering')?.managerId).toBe('emp-early');
    expect(summary.unitManagerAssignments).toBe(1);
    expect(assign).toHaveBeenCalledWith('emp-early', 'role-um');
  });

  it('breaks a tenure tie by employeeId, deterministically', async () => {
    const sameDate = new Date('2024-01-01');
    const { prisma, assignmentService, departmentsByName } = makeDeps([
      { value: 'Engineering', employeeId: 'emp-b', effectiveFrom: sameDate },
      { value: 'Engineering', employeeId: 'emp-a', effectiveFrom: sameDate },
    ]);

    await seedDepartments(prisma, assignmentService, silentLogger);

    expect(departmentsByName.get('Engineering')?.managerId).toBe('emp-a');
  });

  it('grants the built-in Unit Manager role to each resolved department manager', async () => {
    const { prisma, assignmentService, assign } = makeDeps([
      {
        value: 'Engineering',
        employeeId: 'emp-1',
        effectiveFrom: new Date('2024-01-01'),
      },
      {
        value: 'Design',
        employeeId: 'emp-2',
        effectiveFrom: new Date('2024-01-01'),
      },
    ]);

    await seedDepartments(prisma, assignmentService, silentLogger);

    expect(assign).toHaveBeenCalledTimes(2);
    expect(assign).toHaveBeenCalledWith('emp-1', 'role-um');
    expect(assign).toHaveBeenCalledWith('emp-2', 'role-um');
  });

  it('is idempotent: rerunning updates managerId in place rather than duplicating rows', async () => {
    const {
      prisma,
      assignmentService,
      departmentsByName,
      departmentCreate,
      departmentUpdate,
    } = makeDeps([
      {
        value: 'Engineering',
        employeeId: 'emp-1',
        effectiveFrom: new Date('2024-01-01'),
      },
    ]);

    await seedDepartments(prisma, assignmentService, silentLogger);
    await seedDepartments(prisma, assignmentService, silentLogger);

    expect(departmentsByName.size).toBe(1);
    expect(departmentCreate).toHaveBeenCalledTimes(1);
    expect(departmentUpdate).toHaveBeenCalledTimes(1);
  });

  it('halts (Block If) when the bootcamp population has no current department history rows', async () => {
    const { prisma, assignmentService } = makeDeps([]);

    await expect(
      seedDepartments(prisma, assignmentService, silentLogger),
    ).rejects.toBeInstanceOf(DepartmentSeedHaltError);
  });

  it('halts when the built-in Unit Manager role has not been seeded yet', async () => {
    const { prisma, assignmentService } = makeDeps(
      [
        {
          value: 'Engineering',
          employeeId: 'emp-1',
          effectiveFrom: new Date('2024-01-01'),
        },
      ],
      null,
    );

    await expect(
      seedDepartments(prisma, assignmentService, silentLogger),
    ).rejects.toBeInstanceOf(DepartmentSeedHaltError);
  });
});
