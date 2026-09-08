import { Test, TestingModule } from '@nestjs/testing';
import { FixedClock } from '../../../../test/support/fixed-clock';
import { Clock } from '../../../clock/clock.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { DashboardAudienceService } from '../dashboard-audience.service';

describe('DashboardAudienceService', () => {
  let service: DashboardAudienceService;
  let prisma: {
    employee: { findMany: jest.Mock };
    projectAssignment: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      employee: { findMany: jest.fn() },
      projectAssignment: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardAudienceService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: Clock,
          useValue: new FixedClock(new Date('2026-06-01T12:00:00.000Z')),
        },
      ],
    }).compile();

    service = module.get(DashboardAudienceService);
  });

  it('listManagerSubordinateIds returns reporting-line descendants only', async () => {
    prisma.employee.findMany
      .mockResolvedValueOnce([{ id: 'sub-1' }])
      .mockResolvedValueOnce([]);

    const result = await service.listManagerSubordinateIds('manager-1');

    expect(result).toEqual(['sub-1']);
    expect(prisma.employee.findMany.mock.calls[0][0]).toEqual({
      where: { managerId: 'manager-1' },
      select: { id: true },
    });
  });

  it('listProjectGroups filters inactive assignments for DM responsibility', async () => {
    prisma.projectAssignment.findMany.mockResolvedValue([
      {
        projectId: 'proj-active',
        employeeId: 'emp-1',
        pmId: 'pm-1',
        dmId: 'dm-1',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: null,
        confirmed: true,
        confirmedAt: new Date('2026-06-01T10:00:00.000Z'),
      },
      {
        projectId: 'proj-stale',
        employeeId: 'emp-2',
        pmId: 'pm-2',
        dmId: 'dm-1',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: null,
        confirmed: false,
        confirmedAt: null,
      },
    ]);

    const groups = await service.listProjectGroups('dm-1', 'dm');

    expect(groups).toEqual([
      {
        projectId: 'proj-active',
        projectName: 'proj-active',
        subjectIds: ['emp-1'],
      },
    ]);
  });

  it('listProjectGroups scopes PM responsibility to pmId', async () => {
    prisma.projectAssignment.findMany.mockResolvedValue([
      {
        projectId: 'proj-a',
        employeeId: 'emp-1',
        pmId: 'pm-1',
        dmId: 'dm-1',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: null,
        confirmed: true,
        confirmedAt: new Date('2026-06-01T10:00:00.000Z'),
      },
    ]);

    await service.listProjectGroups('pm-1', 'pm');

    expect(prisma.projectAssignment.findMany.mock.calls[0][0]).toEqual({
      where: { pmId: 'pm-1' },
      select: {
        projectId: true,
        employeeId: true,
        pmId: true,
        dmId: true,
        startDate: true,
        endDate: true,
        confirmed: true,
        confirmedAt: true,
      },
    });
  });
});
