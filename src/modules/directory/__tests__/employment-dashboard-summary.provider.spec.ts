import { Test, TestingModule } from '@nestjs/testing';
import { Clock } from '../../../clock/clock.service';
import { ProjectAssignment } from '../../contracts/project-assignment.contract';
import type { ProjectAssignmentDto } from '../../contracts/project-assignment.contract';
import { EmploymentDashboardSummaryProvider } from '../employment-dashboard-summary.provider';

describe('EmploymentDashboardSummaryProvider', () => {
  let provider: EmploymentDashboardSummaryProvider;
  const projectAssignment = {
    listByEmployee: jest.fn(),
  };
  const fixedNow = new Date('2026-09-05T12:00:00.000Z');

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmploymentDashboardSummaryProvider,
        { provide: ProjectAssignment, useValue: projectAssignment },
        {
          provide: Clock,
          useValue: { now: jest.fn(() => fixedNow) },
        },
      ],
    }).compile();

    provider = module.get(EmploymentDashboardSummaryProvider);
  });

  it('returns empty cells when scope has no subject ids', async () => {
    const result = await provider.getSummary('viewer');

    expect(result).toEqual({
      providerId: 'employment',
      status: 'available',
      cells: {},
    });
    expect(projectAssignment.listByEmployee).not.toHaveBeenCalled();
  });

  it('uses fresh confirmed assignments for project labels', async () => {
    projectAssignment.listByEmployee.mockResolvedValue([
      assignment({
        projectId: 'proj-a',
        confirmed: true,
        confirmedAt: '2026-09-05T10:00:00.000Z',
      }),
    ]);

    const result = await provider.getSummary('viewer', {
      subjectIds: ['emp-1'],
    });

    expect(result).toEqual({
      providerId: 'employment',
      status: 'available',
      cells: {
        'emp-1': {
          value: 'proj-a',
          unavailable: false,
          stale: false,
        },
      },
    });
  });

  it('marks cells stale when only active assignments are outside freshness window', async () => {
    projectAssignment.listByEmployee.mockResolvedValue([
      assignment({
        projectId: 'proj-stale',
        confirmed: true,
        confirmedAt: '2026-09-04T06:00:00.000Z',
      }),
    ]);

    const result = await provider.getSummary('viewer', {
      subjectIds: ['emp-1'],
    });

    expect(result).toEqual({
      providerId: 'employment',
      status: 'available',
      cells: {
        'emp-1': {
          value: 'proj-stale',
          unavailable: false,
          stale: true,
        },
      },
    });
  });

  it('ignores assignments outside the active date window', async () => {
    projectAssignment.listByEmployee.mockResolvedValue([
      assignment({
        projectId: 'future',
        startDate: '2026-09-10',
        confirmed: true,
        confirmedAt: '2026-09-05T10:00:00.000Z',
      }),
      assignment({
        projectId: 'ended',
        endDate: '2026-09-01',
        confirmed: true,
        confirmedAt: '2026-09-05T10:00:00.000Z',
      }),
    ]);

    const result = await provider.getSummary('viewer', {
      subjectIds: ['emp-1'],
    });

    expect(result).toEqual({
      providerId: 'employment',
      status: 'available',
      cells: {
        'emp-1': {
          value: '',
          unavailable: false,
          stale: false,
        },
      },
    });
  });

  it('returns unavailable when project assignment reader throws', async () => {
    projectAssignment.listByEmployee.mockRejectedValue(new Error('reader down'));

    const result = await provider.getSummary('viewer', {
      subjectIds: ['emp-1'],
    });

    expect(result).toEqual({
      providerId: 'employment',
      status: 'unavailable',
    });
  });
});

const assignment = (
  overrides: Partial<ProjectAssignmentDto> = {},
): ProjectAssignmentDto => ({
  employeeId: 'emp-1',
  projectId: 'proj-a',
  pmId: 'pm-1',
  dmId: 'dm-1',
  startDate: '2026-01-01',
  endDate: null,
  confirmed: false,
  confirmedAt: null,
  ...overrides,
});
