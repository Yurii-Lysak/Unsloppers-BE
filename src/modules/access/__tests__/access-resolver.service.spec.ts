import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { AccessResolverService } from '../access-resolver.service';

describe('AccessResolverService', () => {
  let service: AccessResolverService;

  const prisma = {
    employee: {
      findUnique: jest.fn(),
    },
  };

  /** Chains a sequence of `managerId` lookups by employee id. */
  const mockChain = (chain: Record<string, string | null>) => {
    prisma.employee.findUnique.mockImplementation(
      ({ where: { id } }: { where: { id: string } }) => {
        if (!(id in chain)) {
          return Promise.resolve(null);
        }
        return Promise.resolve({ managerId: chain[id] });
      },
    );
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccessResolverService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(AccessResolverService);
  });

  it('grants Self when viewer and subject are the same employee, without any managerId lookup', async () => {
    const result = await service.resolveAudience('emp-x', 'emp-x');

    expect(result.role).toBe('Self');
    expect(prisma.employee.findUnique).not.toHaveBeenCalled();
  });

  it('does not grant Self when both viewerId and subjectId are empty strings', async () => {
    mockChain({});

    const result = await service.resolveAudience('', '');

    expect(result.role).toBe('Colleague');
  });

  it('grants ReportingLine for a direct report (B reports to M)', async () => {
    // B.managerId = M
    mockChain({ B: 'M', M: null });

    const result = await service.resolveAudience('M', 'B');

    expect(result.role).toBe('ReportingLine');
    expect(result.sections).toEqual({
      S1: 'RW',
      S2: 'R',
      S3: 'R',
      S4: 'RW',
      S5: 'R',
      S6: 'RW',
      S7: 'RW',
      S8: 'RW',
      S9: 'RW',
      S10: 'R',
      S11: 'R',
      S12: 'RW',
      S13: 'RW',
      S14: 'RW',
      S15: 'R',
      S16: 'RW',
    });
  });

  it('grants ReportingLine transitively (D over B via M, 2 levels)', async () => {
    // B.managerId = M, M.managerId = D
    mockChain({ B: 'M', M: 'D', D: null });

    const result = await service.resolveAudience('D', 'B');

    expect(result.role).toBe('ReportingLine');
  });

  it('resolves Colleague for two unrelated employees', async () => {
    // B.managerId = M, M has no manager; A shares no overlap
    mockChain({ B: 'M', M: null });

    const result = await service.resolveAudience('A', 'B');

    expect(result.role).toBe('Colleague');
    expect(Object.values(result.sections).every((v) => v === 'none')).toBe(
      true,
    );
  });

  it('resolves Colleague and never loops on a cyclical manager chain', async () => {
    // B -> M -> B -> ... a corrupted cycle that never reaches viewer A
    mockChain({ B: 'M', M: 'B' });

    const result = await service.resolveAudience('A', 'B');

    expect(result.role).toBe('Colleague');
    expect(prisma.employee.findUnique).toHaveBeenCalledTimes(2);
  });

  it('resolves Colleague when the chain hits a dangling/invalid id mid-walk, without throwing', async () => {
    // B.managerId = 'ghost', but no Employee row exists for 'ghost'
    mockChain({ B: 'ghost' });

    await expect(
      service.resolveAudience('someone', 'B'),
    ).resolves.toMatchObject({ role: 'Colleague' });
  });

  it('resolves Colleague and never loops on a single-node self-referencing cycle', async () => {
    // X.managerId = X (corrupted self-reference)
    mockChain({ X: 'X' });

    const result = await service.resolveAudience('A', 'X');

    expect(result.role).toBe('Colleague');
    expect(prisma.employee.findUnique).toHaveBeenCalledTimes(1);
  });

  it('resolves Colleague when only viewerId is empty and subjectId is a real chain', async () => {
    // B.managerId = M, M has no manager; viewerId is an empty string
    mockChain({ B: 'M', M: null });

    const result = await service.resolveAudience('', 'B');

    expect(result.role).toBe('Colleague');
  });
});
