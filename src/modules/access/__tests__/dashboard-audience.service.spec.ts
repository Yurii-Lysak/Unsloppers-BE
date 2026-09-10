import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FixedClock } from '../../../../test/support/fixed-clock';
import { Clock } from '../../../clock/clock.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { DashboardAudienceService } from '../dashboard-audience.service';

describe('DashboardAudienceService', () => {
  let service: DashboardAudienceService;
  const prisma = {
    employee: {
      findMany: jest.fn(),
    },
    departmentHistory: {
      findFirst: jest.fn(),
    },
    projectAssignment: {
      findMany: jest.fn(),
    },
  };

  const setOpenDepartments = (entries: Record<string, string | null>) => {
    prisma.departmentHistory.findFirst.mockImplementation(
      ({ where }: { where: { employeeId: string } }) => {
        const value = entries[where.employeeId];
        return Promise.resolve(value ? { value } : null);
      },
    );
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardAudienceService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: Clock,
          useValue: new FixedClock(new Date('2026-06-01T12:00:00.000Z')),
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'HR_DEPARTMENT_VALUE' ? 'HR' : undefined,
            ),
          },
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
    expect(prisma.employee.findMany).toHaveBeenCalledWith({
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

    expect(prisma.projectAssignment.findMany).toHaveBeenCalledWith({
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

  it('listPpAssignedIds returns direct peoplePartnerId matches for any viewer department', async () => {
    setOpenDepartments({ viewer: 'Engineering' });
    prisma.employee.findMany.mockResolvedValue([
      { id: 'assignee-1' },
      { id: 'assignee-2' },
    ]);

    const result = await service.listPpAssignedIds('viewer');

    expect(result).toEqual(['assignee-1', 'assignee-2']);
    expect(prisma.employee.findMany).toHaveBeenCalledWith({
      where: { peoplePartnerId: { in: ['viewer'] } },
      select: { id: true },
    });
  });

  it('listPpAssignedIds includes HR-line indirect assignees through HR managers', async () => {
    setOpenDepartments({
      viewer: 'HR',
      'hr-manager': 'HR',
      'pp-anchor': 'Sales',
    });

    prisma.employee.findMany
      .mockResolvedValueOnce([{ id: 'hr-manager' }])
      .mockResolvedValueOnce([{ id: 'pp-anchor' }])
      .mockResolvedValueOnce([{ id: 'indirect-assignee' }]);

    const result = await service.listPpAssignedIds('viewer');

    expect(result).toEqual(['indirect-assignee']);
    expect(prisma.employee.findMany).toHaveBeenLastCalledWith({
      where: {
        peoplePartnerId: { in: ['viewer', 'hr-manager', 'pp-anchor'] },
      },
      select: { id: true },
    });
  });

  it('listPpAssignedIds excludes assignees beyond a non-HR intermediate manager', async () => {
    setOpenDepartments({
      viewer: 'HR',
      'non-hr-manager': 'Engineering',
      'pp-anchor': 'HR',
    });

    prisma.employee.findMany
      .mockResolvedValueOnce([{ id: 'non-hr-manager' }])
      .mockResolvedValueOnce([]);

    const result = await service.listPpAssignedIds('viewer');

    expect(result).toEqual([]);
    expect(prisma.employee.findMany).toHaveBeenLastCalledWith({
      where: { peoplePartnerId: { in: ['viewer', 'non-hr-manager'] } },
      select: { id: true },
    });
  });

  it('listPpAssignedIds does not extend the HR walk when the viewer is not HR', async () => {
    setOpenDepartments({ viewer: 'Engineering' });
    prisma.employee.findMany.mockResolvedValue([{ id: 'direct-assignee' }]);

    const result = await service.listPpAssignedIds('viewer');

    expect(result).toEqual(['direct-assignee']);
    expect(prisma.employee.findMany).toHaveBeenCalledTimes(1);
  });

  it('listPpAssignedIds stops walking when a reporting cycle is detected', async () => {
    const warnSpy = jest
      .spyOn(service['logger'], 'warn')
      .mockImplementation(() => undefined);
    setOpenDepartments({ viewer: 'HR', 'hr-manager': 'HR' });

    prisma.employee.findMany
      .mockResolvedValueOnce([{ id: 'hr-manager' }])
      .mockResolvedValueOnce([{ id: 'hr-manager' }])
      .mockResolvedValueOnce([{ id: 'cycle-assignee' }]);

    const result = await service.listPpAssignedIds('viewer');

    expect(result).toEqual(['cycle-assignee']);
    expect(warnSpy).toHaveBeenCalledWith(
      'Cycle detected while walking PP audience from viewerId=viewer',
    );
    warnSpy.mockRestore();
  });
});
