import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { DepartmentDashboardSummaryProvider } from '../department-dashboard-summary.provider';

describe('DepartmentDashboardSummaryProvider', () => {
  let provider: DepartmentDashboardSummaryProvider;
  const prisma = {
    employee: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DepartmentDashboardSummaryProvider,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    provider = module.get(DepartmentDashboardSummaryProvider);
  });

  it('returns empty cells when scope has no subject ids', async () => {
    const result = await provider.getSummary('viewer');

    expect(result).toEqual({
      providerId: 'department',
      status: 'available',
      cells: {},
    });
    expect(prisma.employee.findMany).not.toHaveBeenCalled();
  });

  it('uses currentHistoryValue for department labels', async () => {
    prisma.employee.findMany.mockResolvedValue([
      {
        id: 'emp-1',
        departmentHistory: [
          {
            value: 'HR',
            effectiveFrom: new Date('2024-01-01T00:00:00.000Z'),
            effectiveTo: null,
          },
        ],
      },
      {
        id: 'emp-2',
        departmentHistory: [],
      },
    ]);

    const result = await provider.getSummary('viewer', {
      subjectIds: ['emp-1', 'emp-2'],
    });

    expect(result).toEqual({
      providerId: 'department',
      status: 'available',
      cells: {
        'emp-1': { value: 'HR', unavailable: false },
        'emp-2': { value: '', unavailable: false },
      },
    });
  });

  it('falls back to the latest closed department row when no open row exists', async () => {
    prisma.employee.findMany.mockResolvedValue([
      {
        id: 'emp-1',
        departmentHistory: [
          {
            value: 'Engineering',
            effectiveFrom: new Date('2022-01-01T00:00:00.000Z'),
            effectiveTo: new Date('2023-01-01T00:00:00.000Z'),
          },
          {
            value: 'Sales',
            effectiveFrom: new Date('2023-01-01T00:00:00.000Z'),
            effectiveTo: new Date('2024-01-01T00:00:00.000Z'),
          },
        ],
      },
    ]);

    const result = await provider.getSummary('viewer', {
      subjectIds: ['emp-1'],
    });

    expect(result).toEqual({
      providerId: 'department',
      status: 'available',
      cells: {
        'emp-1': { value: 'Sales', unavailable: false },
      },
    });
  });

  it('returns unavailable when the query throws', async () => {
    prisma.employee.findMany.mockRejectedValue(new Error('database down'));

    const result = await provider.getSummary('viewer', {
      subjectIds: ['emp-1'],
    });

    expect(result).toEqual({
      providerId: 'department',
      status: 'unavailable',
    });
  });
});
