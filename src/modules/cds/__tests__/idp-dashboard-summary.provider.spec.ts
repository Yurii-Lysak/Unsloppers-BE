import { Test, TestingModule } from '@nestjs/testing';
import { Clock } from '../../../clock/clock.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { IdpDashboardSummaryProvider } from '../idp-dashboard-summary.provider';

describe('IdpDashboardSummaryProvider', () => {
  let provider: IdpDashboardSummaryProvider;
  const prisma = {
    iDPRecord: {
      findMany: jest.fn(),
    },
  };
  const fixedNow = new Date('2026-09-05T12:00:00.000Z');

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdpDashboardSummaryProvider,
        { provide: PrismaService, useValue: prisma },
        {
          provide: Clock,
          useValue: { now: jest.fn(() => fixedNow) },
        },
      ],
    }).compile();

    provider = module.get(IdpDashboardSummaryProvider);
  });

  it('returns empty rows when scope has no subject ids', async () => {
    const result = await provider.getSummary('viewer');

    expect(result).toEqual({
      providerId: 'idp',
      status: 'available',
      rows: [],
    });
    expect(prisma.iDPRecord.findMany).not.toHaveBeenCalled();
  });

  it('returns open IDPs due within the next 30 days sorted by deadline', async () => {
    prisma.iDPRecord.findMany.mockResolvedValue([
      {
        id: 'idp-1',
        employeeId: 'emp-1',
        description: 'Communication skills',
        deadline: new Date('2026-09-10T00:00:00.000Z'),
        employee: { user: { name: 'Emp One', email: 'emp1@example.com' } },
      },
      {
        id: 'idp-2',
        employeeId: 'emp-2',
        description: 'Leadership track',
        deadline: new Date('2026-09-25T00:00:00.000Z'),
        employee: { user: { name: 'Emp Two', email: 'emp2@example.com' } },
      },
    ]);

    const result = await provider.getSummary('viewer', {
      subjectIds: ['emp-1', 'emp-2'],
    });

    expect(prisma.iDPRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          employeeId: { in: ['emp-1', 'emp-2'] },
          completedAt: null,
          deadline: {
            gte: new Date('2026-09-05T00:00:00.000Z'),
            lte: new Date('2026-10-05T00:00:00.000Z'),
          },
        },
        orderBy: { deadline: 'asc' },
      }),
    );
    expect(result).toEqual({
      providerId: 'idp',
      status: 'available',
      rows: [
        {
          id: 'idp-1',
          employeeId: 'emp-1',
          employeeDisplayName: 'Emp One',
          description: 'Communication skills',
          deadline: '2026-09-10',
        },
        {
          id: 'idp-2',
          employeeId: 'emp-2',
          employeeDisplayName: 'Emp Two',
          description: 'Leadership track',
          deadline: '2026-09-25',
        },
      ],
    });
  });

  it('filters completed, past-due, and beyond-window records at the query layer', async () => {
    prisma.iDPRecord.findMany.mockResolvedValue([]);

    await provider.getSummary('viewer', { subjectIds: ['emp-1'] });

    expect(prisma.iDPRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          completedAt: null,
          deadline: {
            gte: new Date('2026-09-05T00:00:00.000Z'),
            lte: new Date('2026-10-05T00:00:00.000Z'),
          },
        }),
      }),
    );
  });

  it('returns unavailable when the query throws', async () => {
    prisma.iDPRecord.findMany.mockRejectedValue(new Error('database down'));

    const result = await provider.getSummary('viewer', {
      subjectIds: ['emp-1'],
    });

    expect(result).toEqual({
      providerId: 'idp',
      status: 'unavailable',
    });
  });
});
