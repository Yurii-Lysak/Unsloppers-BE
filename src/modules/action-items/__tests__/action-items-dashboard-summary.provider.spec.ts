import { Test, TestingModule } from '@nestjs/testing';
import { Clock } from '../../../clock/clock.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ActionItemsDashboardSummaryProvider } from '../action-items-dashboard-summary.provider';

describe('ActionItemsDashboardSummaryProvider', () => {
  let provider: ActionItemsDashboardSummaryProvider;
  let prisma: { actionItem: { findMany: jest.Mock } };
  const fixedNow = new Date('2026-09-05T12:00:00.000Z');

  beforeEach(async () => {
    prisma = {
      actionItem: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActionItemsDashboardSummaryProvider,
        { provide: PrismaService, useValue: prisma },
        {
          provide: Clock,
          useValue: { now: jest.fn(() => fixedNow) },
        },
      ],
    }).compile();

    provider = module.get(ActionItemsDashboardSummaryProvider);
  });

  it('returns zero counts when scope has no subject ids', async () => {
    const result = await provider.getSummary('viewer');

    expect(result).toEqual({
      providerId: 'action-items',
      status: 'available',
      openCount: 0,
      overdueCount: 0,
    });
    expect(prisma.actionItem.findMany).not.toHaveBeenCalled();
  });

  it('counts open and overdue action items for scoped assignees', async () => {
    prisma.actionItem.findMany.mockResolvedValue([
      { status: 'open', dueDate: new Date('2026-09-01T00:00:00.000Z') },
      { status: 'open', dueDate: new Date('2026-09-10T00:00:00.000Z') },
    ]);

    const result = await provider.getSummary('viewer', {
      subjectIds: ['sub-1', 'sub-2'],
    });

    expect(prisma.actionItem.findMany).toHaveBeenCalledWith({
      where: {
        assigneeId: { in: ['sub-1', 'sub-2'] },
        status: 'open',
      },
      select: { status: true, dueDate: true },
    });
    expect(result).toEqual({
      providerId: 'action-items',
      status: 'available',
      openCount: 2,
      overdueCount: 1,
    });
  });

  it('returns unavailable when prisma throws', async () => {
    prisma.actionItem.findMany.mockRejectedValue(new Error('db down'));

    const result = await provider.getSummary('viewer', {
      subjectIds: ['sub-1'],
    });

    expect(result).toEqual({
      providerId: 'action-items',
      status: 'unavailable',
    });
  });
});
