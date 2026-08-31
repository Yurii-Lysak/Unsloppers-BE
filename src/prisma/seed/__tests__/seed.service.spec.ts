import { join } from 'node:path';
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

  const employeeUpsert = jest.fn(
    ({
      where,
      create,
    }: {
      where: { userId: string };
      create: { userId: string };
    }) => {
      const id = `employee-${where.userId}`;
      return Promise.resolve({ id, userId: create.userId });
    },
  );

  const externalIdentityUpsert = jest.fn(() =>
    Promise.resolve({ id: 'map-1' }),
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
    employee: { upsert: employeeUpsert },
    externalIdentity: { upsert: externalIdentityUpsert },
    gradeHistory: grade,
    positionHistory: position,
    departmentHistory: department,
    employmentTypeHistory: employmentType,
  } as unknown as PrismaService;

  return {
    prisma,
    users,
    userFindUnique,
    userUpsert,
    gradeCreate: grade.create,
    positionCreate: position.create,
    departmentCreate: department.create,
    employmentTypeCreate: employmentType.create,
    externalIdentityUpsert,
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
      externalIdentityUpsert,
    } = makePrismaMock();

    const summary = await new SeedService(
      prisma,
      initialPassword,
      fixturePath,
    ).run(now);

    expect(summary.identitiesUpserted).toBe(3);
    expect(userUpsert).toHaveBeenCalledTimes(3);
    expect(externalIdentityUpsert).toHaveBeenCalledTimes(3);
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
    const { prisma, userUpsert, gradeCreate } = makePrismaMock();
    const service = new SeedService(prisma, initialPassword, fixturePath);

    await service.run(now);
    await service.run(now);

    expect(userUpsert).toHaveBeenCalledTimes(6);
    expect(gradeCreate).toHaveBeenCalledTimes(3);
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
