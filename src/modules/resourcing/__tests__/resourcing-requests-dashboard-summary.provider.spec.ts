import { Test, TestingModule } from '@nestjs/testing';
import { ResourcingRequestsDashboardSummaryProvider } from '../resourcing-requests-dashboard-summary.provider';
import { ResourcingService } from '../resourcing.service';

describe('ResourcingRequestsDashboardSummaryProvider', () => {
  let provider: ResourcingRequestsDashboardSummaryProvider;
  const resourcing = {
    listRequests: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourcingRequestsDashboardSummaryProvider,
        { provide: ResourcingService, useValue: resourcing },
      ],
    }).compile();

    provider = module.get(ResourcingRequestsDashboardSummaryProvider);
  });

  it('returns DM-visible requests for the dashboard block', async () => {
    resourcing.listRequests.mockResolvedValue([
      {
        id: 'req-1',
        vacancyDetails: 'Backend engineer',
        status: 'open',
        projectId: 'proj-a',
        author: { id: 'dm-1', displayName: 'DM Viewer' },
        createdAt: '2026-01-02T00:00:00.000Z',
      },
      {
        id: 'req-2',
        vacancyDetails: 'Closed role',
        status: 'fulfilled',
        projectId: null,
        author: { id: 'dm-1', displayName: 'DM Viewer' },
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const result = await provider.getSummary('dm-viewer', {
      subjectIds: [],
      variant: 'dm',
    });

    expect(result).toEqual({
      providerId: 'resourcing-requests',
      status: 'available',
      requests: [
        {
          id: 'req-1',
          vacancyDetails: 'Backend engineer',
          status: 'open',
          projectId: 'proj-a',
          authorDisplayName: 'DM Viewer',
          createdAt: '2026-01-02T00:00:00.000Z',
        },
      ],
    });
  });

  it('filters requests to unassigned project scope', async () => {
    resourcing.listRequests.mockResolvedValue([
      {
        id: 'req-1',
        vacancyDetails: 'Unassigned role',
        status: 'pending_dm_review',
        projectId: null,
        author: { id: 'dm-1', displayName: 'DM Viewer' },
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'req-2',
        vacancyDetails: 'Project role',
        status: 'open',
        projectId: 'proj-a',
        author: { id: 'dm-1', displayName: 'DM Viewer' },
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const result = await provider.getSummary('dm-viewer', {
      subjectIds: [],
      variant: 'dm',
      projectId: 'unassigned',
    });

    expect(result).toEqual({
      providerId: 'resourcing-requests',
      status: 'available',
      requests: [
        {
          id: 'req-1',
          vacancyDetails: 'Unassigned role',
          status: 'pending_dm_review',
          projectId: null,
          authorDisplayName: 'DM Viewer',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
  });

  it('returns unavailable for non-DM variants', async () => {
    const result = await provider.getSummary('um-viewer', {
      subjectIds: ['sub-1'],
      variant: 'um',
    });

    expect(result).toEqual({
      providerId: 'resourcing-requests',
      status: 'unavailable',
    });
    expect(resourcing.listRequests).not.toHaveBeenCalled();
  });

  it('returns unavailable for a third variant (pp), proving the gate is dm/pm-only', async () => {
    const result = await provider.getSummary('pp-viewer', {
      subjectIds: ['sub-1'],
      variant: 'pp',
    });

    expect(result).toEqual({
      providerId: 'resourcing-requests',
      status: 'unavailable',
    });
    expect(resourcing.listRequests).not.toHaveBeenCalled();
  });

  it('returns PM-authored requests for the dashboard block', async () => {
    resourcing.listRequests.mockResolvedValue([
      {
        id: 'req-1',
        vacancyDetails: 'Backend engineer',
        status: 'open',
        projectId: 'proj-a',
        author: { id: 'pm-1', displayName: 'PM Viewer' },
        createdAt: '2026-01-02T00:00:00.000Z',
      },
      {
        id: 'req-2',
        vacancyDetails: 'Closed role',
        status: 'fulfilled',
        projectId: 'proj-a',
        author: { id: 'pm-1', displayName: 'PM Viewer' },
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const result = await provider.getSummary('pm-viewer', {
      subjectIds: [],
      variant: 'pm',
    });

    expect(resourcing.listRequests).toHaveBeenCalledWith('pm-viewer');
    expect(result).toEqual({
      providerId: 'resourcing-requests',
      status: 'available',
      requests: [
        {
          id: 'req-1',
          vacancyDetails: 'Backend engineer',
          status: 'open',
          projectId: 'proj-a',
          authorDisplayName: 'PM Viewer',
          createdAt: '2026-01-02T00:00:00.000Z',
        },
      ],
    });
  });

  it('returns unavailable when listRequests throws for a PM viewer', async () => {
    resourcing.listRequests.mockRejectedValue(new Error('service down'));

    const result = await provider.getSummary('pm-viewer', {
      subjectIds: [],
      variant: 'pm',
    });

    expect(result).toEqual({
      providerId: 'resourcing-requests',
      status: 'unavailable',
    });
  });
});
