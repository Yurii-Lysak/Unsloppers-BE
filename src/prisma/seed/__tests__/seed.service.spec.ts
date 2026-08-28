import { join } from 'node:path';
import { PrismaService } from '../../prisma.service';
import { EmptySeedPopulationError, SeedManifestError } from '../seed.errors';
import { SeedService } from '../seed.service';

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

  const grade = historyDelegate('grade');
  const position = historyDelegate('position');
  const department = historyDelegate('department');
  const employmentType = historyDelegate('employmentType');

  const prisma = {
    user: { upsert: userUpsert },
    employee: { upsert: employeeUpsert },
    gradeHistory: grade,
    positionHistory: position,
    departmentHistory: department,
    employmentTypeHistory: employmentType,
  } as unknown as PrismaService;

  return {
    prisma,
    users,
    userUpsert,
    gradeCreate: grade.create,
    positionCreate: position.create,
    departmentCreate: department.create,
    employmentTypeCreate: employmentType.create,
  };
}

describe('SeedService', () => {
  const now = new Date('2026-08-28T00:00:00Z');

  it('creates a User/Employee for every manifest identity and seeds initial history', async () => {
    const {
      prisma,
      userUpsert,
      gradeCreate,
      positionCreate,
      departmentCreate,
      employmentTypeCreate,
    } = makePrismaMock();

    const summary = await new SeedService(prisma, fixturePath).run(now);

    expect(summary.identitiesUpserted).toBe(3);
    expect(userUpsert).toHaveBeenCalledTimes(3);
    expect(gradeCreate).toHaveBeenCalledTimes(3);
    expect(positionCreate).toHaveBeenCalledTimes(3);
    expect(departmentCreate).toHaveBeenCalledTimes(3);
    expect(employmentTypeCreate).toHaveBeenCalledTimes(3);
  });

  it('is idempotent: rerunning updates in place and does not duplicate history', async () => {
    const { prisma, userUpsert, gradeCreate } = makePrismaMock();
    const service = new SeedService(prisma, fixturePath);

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
      new SeedService(prisma, emptyManifestPath).run(now),
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

    await expect(new SeedService(prisma, badPath).run(now)).rejects.toBeInstanceOf(
      SeedManifestError,
    );
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

    const summary = await new SeedService(prisma, dedupePath).run(now);

    expect(summary.identitiesUpserted).toBe(2);
    expect(summary.duplicateEmailsSkipped).toBe(1);
    expect(userUpsert).toHaveBeenCalledTimes(2);

    fs.unlinkSync(dedupePath);
  });
});
