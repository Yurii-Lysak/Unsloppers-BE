import { join } from 'node:path';
import {
  BUILT_IN_ROLE_NAMES,
  PERMISSION_KEYS,
} from '../../../modules/contracts/permission-keys';
import { PrismaService } from '../../prisma.service';
import {
  EmptySeedPopulationError,
  InitialPasswordMissingError,
  InitialPasswordTooLongError,
  SeedManifestError,
} from '../seed.errors';
import { SeedService } from '../seed.service';

const initialPassword = 'test-only-initial-password';

const fixturePath = join(
  __dirname,
  'fixtures',
  'bootcamp-identities.fixture.json',
);

function employee(
  overrides: Partial<{
    id: number;
    email: string;
    name: string;
    hash: string;
    countryCode: string;
  }> = {},
) {
  return {
    id: 1,
    email: 'user1@example.com',
    name: 'User One',
    hash: 'hash-1',
    countryCode: 'US',
    ...overrides,
  };
}

function makePrismaMock() {
  const users = new Map<
    string,
    {
      id: string;
      email: string;
      name?: string;
      hash?: string;
      passwordHash?: string | null;
      countryCode?: string;
    }
  >();
  const openHistoryRows = new Set<string>();

  const historyDelegate = (dimension: string) => {
    const findFirst = jest.fn(({ where }: { where: { employeeId: string } }) =>
      Promise.resolve(
        openHistoryRows.has(`${where.employeeId}:${dimension}`)
          ? { id: 'existing-row' }
          : null,
      ),
    );
    const create = jest.fn(({ data }: { data: { employeeId: string } }) => {
      openHistoryRows.add(`${data.employeeId}:${dimension}`);
      return Promise.resolve({ id: 'new-row', ...data });
    });
    return { findFirst, create };
  };

  const userUpsert = jest.fn(
    ({
      where,
      create,
      update,
    }: {
      where: { email: string };
      create: {
        email: string;
        name?: string;
        hash?: string;
        passwordHash?: string;
        countryCode?: string;
      };
      update: Record<string, unknown>;
    }) => {
      const existing = users.get(where.email);
      if (existing) {
        Object.assign(existing, update);
        return Promise.resolve(existing);
      }
      const created = { id: `user-${users.size + 1}`, ...create };
      users.set(where.email, created);
      return Promise.resolve(created);
    },
  );
  const userFindUnique = jest.fn(({ where }: { where: { email: string } }) =>
    Promise.resolve(users.get(where.email) ?? null),
  );
  const userUpdateMany = jest.fn(
    ({
      where,
      data,
    }: {
      where: { id: string; passwordHash: null };
      data: { passwordHash: string };
    }) => {
      const existing = [...users.values()].find((user) => user.id === where.id);
      if (!existing || existing.passwordHash != null) {
        return Promise.resolve({ count: 0 });
      }
      existing.passwordHash = data.passwordHash;
      return Promise.resolve({ count: 1 });
    },
  );

  const employeesByUserId = new Map<string, { id: string; userId: string }>();
  const roles = new Map<
    string,
    {
      id: string;
      name: string;
      isBuiltIn: boolean;
      permissions: { permissionKey: string }[];
    }
  >();

  const employeeUpsert = jest.fn(
    ({
      where,
      create,
    }: {
      where: { userId: string };
      create: { userId: string };
    }) => {
      const id = `employee-${where.userId}`;
      const row = { id, userId: create.userId };
      employeesByUserId.set(create.userId, row);
      return Promise.resolve(row);
    },
  );

  const employeeFindUnique = jest.fn(
    ({ where }: { where: { userId?: string; id?: string } }) => {
      if (where.userId) {
        return Promise.resolve(employeesByUserId.get(where.userId) ?? null);
      }
      if (where.id) {
        for (const employee of employeesByUserId.values()) {
          if (employee.id === where.id) {
            return Promise.resolve(employee);
          }
        }
        return Promise.resolve(null);
      }
      return Promise.resolve(null);
    },
  );
  const employeeFindFirst = jest.fn(
    ({ where }: { where: { user: { email: string } } }) => {
      const user = [...users.values()].find(
        entry => entry.email === where.user.email,
      );
      if (!user) {
        return Promise.resolve(null);
      }
      return Promise.resolve(employeesByUserId.get(user.id) ?? null);
    },
  );

  const functionalRoleFindFirst = jest.fn(
    ({
      where,
    }: {
      where: { name?: { equals: string; mode: 'insensitive' } };
    }) => {
      const target = where.name?.equals.toLowerCase();
      if (!target) {
        return Promise.resolve(null);
      }
      for (const role of roles.values()) {
        if (role.name.toLowerCase() === target) {
          return Promise.resolve(role);
        }
      }
      return Promise.resolve(null);
    },
  );

  const functionalRoleCreate = jest.fn(
    ({
      data,
    }: {
      data: {
        name: string;
        isBuiltIn: boolean;
        permissions: { create: { permissionKey: string }[] };
      };
    }) => {
      const created = {
        id: `role-${roles.size + 1}`,
        name: data.name,
        isBuiltIn: data.isBuiltIn,
        permissions: data.permissions.create.map(entry => ({
          permissionKey: entry.permissionKey,
        })),
      };
      roles.set(data.name, created);
      return Promise.resolve(created);
    },
  );

  const functionalRoleUpdate = jest.fn(
    ({
      where,
      data,
    }: {
      where: { id: string };
      data: { isBuiltIn: boolean };
    }) => {
      for (const role of roles.values()) {
        if (role.id === where.id) {
          role.isBuiltIn = data.isBuiltIn;
          return Promise.resolve(role);
        }
      }
      return Promise.reject(new Error('role not found'));
    },
  );

  const functionalRoleFindFirstOrThrow = jest.fn(
    ({
      where,
    }: {
      where: { name?: { equals: string; mode: 'insensitive' } };
    }) => {
      const target = where.name?.equals.toLowerCase();
      for (const role of roles.values()) {
        if (role.name.toLowerCase() === target) {
          return Promise.resolve(role);
        }
      }
      return Promise.reject(new Error('role not found'));
    },
  );

  const functionalRoleUpsert = jest.fn(
    ({
      where,
      create,
      update,
    }: {
      where: { name: string };
      create: {
        name: string;
        isBuiltIn: boolean;
        permissions: { create: { permissionKey: string }[] };
      };
      update: { isBuiltIn: boolean };
    }) => {
      const existing = roles.get(where.name);
      if (existing) {
        existing.isBuiltIn = update.isBuiltIn;
        return Promise.resolve(existing);
      }
      const created = {
        id: `role-${roles.size + 1}`,
        name: create.name,
        isBuiltIn: create.isBuiltIn,
        permissions: create.permissions.create.map(entry => ({
          permissionKey: entry.permissionKey,
        })),
      };
      roles.set(where.name, created);
      return Promise.resolve(created);
    },
  );

  const functionalRoleFindUnique = jest.fn(
    ({ where }: { where: { id?: string; name?: string } }) => {
      if (where.id) {
        for (const role of roles.values()) {
          if (role.id === where.id) {
            return Promise.resolve(role);
          }
        }
        return Promise.resolve(null);
      }
      if (where.name) {
        return Promise.resolve(roles.get(where.name) ?? null);
      }
      return Promise.resolve(null);
    },
  );

  const functionalRoleFindUniqueOrThrow = jest.fn(
    ({ where }: { where: { name: string } }) => {
      const role = roles.get(where.name);
      if (!role) {
        return Promise.reject(new Error('role not found'));
      }
      return Promise.resolve(role);
    },
  );

  const functionalRolePermissionCreate = jest.fn(
    ({ data }: { data: { roleId: string; permissionKey: string } }) =>
      Promise.resolve({ id: 'perm-1', ...data }),
  );

  const functionalRolePermissionDeleteMany = jest.fn(() =>
    Promise.resolve({ count: 0 }),
  );

  const functionalRoleAssignmentUpsert = jest.fn(() =>
    Promise.resolve({ id: 'assign-1' }),
  );

  const grade = historyDelegate('grade');
  const position = historyDelegate('position');
  const department = historyDelegate('department');
  const employmentType = historyDelegate('employmentType');

  const prisma = {
    user: {
      findUnique: userFindUnique,
      updateMany: userUpdateMany,
      upsert: userUpsert,
    },
    employee: {
      upsert: employeeUpsert,
      findFirst: employeeFindFirst,
      findUnique: employeeFindUnique,
    },
    functionalRole: {
      upsert: functionalRoleUpsert,
      findFirst: functionalRoleFindFirst,
      findFirstOrThrow: functionalRoleFindFirstOrThrow,
      create: functionalRoleCreate,
      update: functionalRoleUpdate,
      findUnique: functionalRoleFindUnique,
      findUniqueOrThrow: functionalRoleFindUniqueOrThrow,
    },
    functionalRolePermission: {
      create: functionalRolePermissionCreate,
      deleteMany: functionalRolePermissionDeleteMany,
    },
    functionalRoleAssignment: {
      upsert: functionalRoleAssignmentUpsert,
    },
    gradeHistory: grade,
    positionHistory: position,
    departmentHistory: department,
    employmentTypeHistory: employmentType,
  } as unknown as PrismaService;

  return {
    prisma,
    users,
    roles,
    userFindUnique,
    userUpsert,
    gradeCreate: grade.create,
    positionCreate: position.create,
    departmentCreate: department.create,
    employmentTypeCreate: employmentType.create,
    functionalRoleCreate,
    functionalRoleAssignmentUpsert,
  };
}

describe('SeedService', () => {
  const now = new Date('2026-08-28T00:00:00Z');

  it('creates a User/Employee for every manifest identity and seeds initial history', async () => {
    const {
      prisma,
      users,
      userUpsert,
      gradeCreate,
      positionCreate,
      departmentCreate,
      employmentTypeCreate,
    } = makePrismaMock();

    const summary = await new SeedService(
      prisma,
      initialPassword,
      fixturePath,
    ).run(now);

    expect(summary.identitiesUpserted).toBe(3);
    expect(summary.functionalRolesUpserted).toBe(5);
    expect(summary.hrAdminAssignments).toBe(1);
    expect(userUpsert).toHaveBeenCalledTimes(3);
    expect(gradeCreate).toHaveBeenCalledTimes(3);
    expect(positionCreate).toHaveBeenCalledTimes(3);
    expect(departmentCreate).toHaveBeenCalledTimes(3);
    expect(employmentTypeCreate).toHaveBeenCalledTimes(3);
    const passwordHashes = [...users.values()].map((user) => user.passwordHash);
    expect(
      passwordHashes.every(
        (passwordHash) =>
          typeof passwordHash === 'string' && /^\$2[aby]\$/.test(passwordHash),
      ),
    ).toBe(true);
    expect(new Set(passwordHashes).size).toBe(3);
  });

  it('is idempotent: rerunning updates in place and does not duplicate history', async () => {
    const { prisma, userUpsert, gradeCreate, functionalRoleAssignmentUpsert } =
      makePrismaMock();
    const service = new SeedService(prisma, initialPassword, fixturePath);

    await service.run(now);
    await service.run(now);

    expect(userUpsert).toHaveBeenCalledTimes(6);
    expect(gradeCreate).toHaveBeenCalledTimes(3);
    expect(functionalRoleAssignmentUpsert).toHaveBeenCalledTimes(2);
  });

  it('seeds D11 built-in role permission sets and HR Admin bootstrap assignment', async () => {
    const {
      prisma,
      roles,
      functionalRoleCreate,
      functionalRoleAssignmentUpsert,
    } = makePrismaMock();

    await new SeedService(prisma, initialPassword, fixturePath).run(now);

    const hrAdmin = [...roles.values()].find(
      role => role.name === BUILT_IN_ROLE_NAMES.HR_ADMIN,
    );
    expect(hrAdmin?.permissions.map(entry => entry.permissionKey).sort()).toEqual(
      [
        PERMISSION_KEYS.CHANGE_ORGANISATIONAL_RELATIONSHIPS,
        PERMISSION_KEYS.MANAGE_CUSTOM_FIELDS,
        PERMISSION_KEYS.MANAGE_DEPARTMENTS,
        PERMISSION_KEYS.MANAGE_FUNCTIONAL_ROLES,
      ].sort(),
    );

    const unitManager = [...roles.values()].find(
      role => role.name === BUILT_IN_ROLE_NAMES.UNIT_MANAGER,
    );
    expect(unitManager?.permissions.map(entry => entry.permissionKey)).toContain(
      PERMISSION_KEYS.FULFIL_RESOURCING_REQUESTS,
    );

    expect(functionalRoleCreate).toHaveBeenCalledTimes(5);
    expect(functionalRoleAssignmentUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          employeeId_roleId: {
            employeeId: 'employee-user-1',
            roleId: hrAdmin?.id,
          },
        },
      }),
    );
  });

  it('empty manifest: halts before writing', async () => {
    const { prisma, userUpsert } = makePrismaMock();
    const emptyManifestPath = join(__dirname, 'fixtures', 'empty.fixture.json');
    const fs = await import('node:fs');
    fs.writeFileSync(
      emptyManifestPath,
      JSON.stringify({ version: 1, identities: [] }),
    );

    await expect(
      new SeedService(prisma, initialPassword, emptyManifestPath).run(now),
    ).rejects.toBeInstanceOf(EmptySeedPopulationError);
    expect(userUpsert).not.toHaveBeenCalled();

    fs.unlinkSync(emptyManifestPath);
  });

  it('malformed manifest identity: fails before writing', async () => {
    const { prisma, userUpsert } = makePrismaMock();
    const badPath = join(__dirname, 'fixtures', 'bad.fixture.json');
    const fs = await import('node:fs');
    fs.writeFileSync(
      badPath,
      JSON.stringify({
        version: 1,
        identities: [employee({ email: '' })],
      }),
    );

    await expect(
      new SeedService(prisma, initialPassword, badPath).run(now),
    ).rejects.toBeInstanceOf(SeedManifestError);
    expect(userUpsert).not.toHaveBeenCalled();

    fs.unlinkSync(badPath);
  });

  it('in-manifest email dedup: keeps the last record, writes once', async () => {
    const { prisma, userUpsert } = makePrismaMock();
    const dedupePath = join(__dirname, 'fixtures', 'dedupe.fixture.json');
    const fs = await import('node:fs');
    fs.writeFileSync(
      dedupePath,
      JSON.stringify({
        version: 1,
        identities: [
          employee({ id: 1, email: 'dup@example.com', name: 'First' }),
          employee({ id: 2, email: 'dup@example.com', name: 'Second' }),
          employee({ id: 3, email: 'other@example.com', name: 'Other' }),
        ],
      }),
    );

    const summary = await new SeedService(
      prisma,
      initialPassword,
      dedupePath,
    ).run(now);

    expect(summary.identitiesUpserted).toBe(2);
    expect(summary.duplicateEmailsSkipped).toBe(1);
    expect(userUpsert).toHaveBeenCalledTimes(2);

    fs.unlinkSync(dedupePath);
  });

  it('fails before writes when the initial password is missing', async () => {
    const { prisma, userUpsert } = makePrismaMock();

    await expect(
      new SeedService(prisma, undefined, fixturePath).run(now),
    ).rejects.toBeInstanceOf(InitialPasswordMissingError);
    expect(userUpsert).not.toHaveBeenCalled();
  });

  it('accepts an initial password whose UTF-8 representation is exactly 72 bytes', async () => {
    const { prisma, userUpsert } = makePrismaMock();

    await new SeedService(prisma, '€'.repeat(24), fixturePath).run(now);

    expect(userUpsert).toHaveBeenCalledTimes(3);
  });

  it('rejects an initial password exceeding 72 UTF-8 bytes before writes', async () => {
    const { prisma, userUpsert } = makePrismaMock();

    await expect(
      new SeedService(prisma, `${'€'.repeat(24)}a`, fixturePath).run(now),
    ).rejects.toBeInstanceOf(InitialPasswordTooLongError);
    expect(userUpsert).not.toHaveBeenCalled();
  });

  it('preserves established credentials and immutable identity hashes', async () => {
    const { prisma, users, userUpsert } = makePrismaMock();
    users.set('user1@example.com', {
      id: 'existing-user',
      email: 'user1@example.com',
      name: 'Old Name',
      hash: 'immutable-identity-hash',
      passwordHash: 'established-credential',
      countryCode: 'US',
    });

    await new SeedService(prisma, initialPassword, fixturePath).run(now);

    expect(users.get('user1@example.com')).toMatchObject({
      hash: 'immutable-identity-hash',
      passwordHash: 'established-credential',
    });
    expect(userUpsert.mock.calls[0][0].update).not.toHaveProperty('hash');
    expect(userUpsert.mock.calls[0][0].update).not.toHaveProperty(
      'passwordHash',
    );
  });

  it('provisions a credential only when an existing user lacks one', async () => {
    const { prisma, users } = makePrismaMock();
    users.set('user1@example.com', {
      id: 'existing-user',
      email: 'user1@example.com',
      hash: 'identity-hash',
      passwordHash: null,
    });

    await new SeedService(prisma, initialPassword, fixturePath).run(now);

    expect(users.get('user1@example.com')?.passwordHash).toEqual(
      expect.stringMatching(/^\$2[aby]\$/),
    );
  });
});
