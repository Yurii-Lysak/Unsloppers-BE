import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DashboardAudience } from '../../contracts/dashboard-audience.contract';
import { DashboardSummaryProvider } from '../../contracts/dashboard-summary-provider.contract';
import { DashboardVariantResolver } from '../../contracts/dashboard-variant-resolver.contract';
import { ProviderRegistryService } from '../../registry/provider-registry.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { DashboardsService } from '../dashboards.service';

describe('DashboardsService', () => {
  let service: DashboardsService;
  let audience: jest.Mocked<DashboardAudience>;
  let variantResolver: jest.Mocked<DashboardVariantResolver>;
  let registry: jest.Mocked<ProviderRegistryService>;
  let prisma: { employee: { findMany: jest.Mock } };
  let risksProvider: jest.Mocked<DashboardSummaryProvider>;
  let actionItemsProvider: jest.Mocked<DashboardSummaryProvider>;
  let leaveProvider: jest.Mocked<DashboardSummaryProvider>;
  let employmentProvider: jest.Mocked<DashboardSummaryProvider>;
  let resourcingProvider: jest.Mocked<DashboardSummaryProvider>;
  let resourcingRequestsProvider: jest.Mocked<DashboardSummaryProvider>;
  let campaignsProvider: jest.Mocked<DashboardSummaryProvider>;
  let departmentProvider: jest.Mocked<DashboardSummaryProvider>;
  let idpProvider: jest.Mocked<DashboardSummaryProvider>;

  beforeEach(async () => {
    audience = {
      listManagerSubordinateIds: jest.fn(),
      listProjectGroups: jest.fn(),
      listPpAssignedIds: jest.fn(),
    };
    variantResolver = {
      resolveVariant: jest.fn(),
    };
    risksProvider = { getSummary: jest.fn() };
    actionItemsProvider = { getSummary: jest.fn() };
    leaveProvider = { getSummary: jest.fn() };
    employmentProvider = { getSummary: jest.fn() };
    resourcingProvider = { getSummary: jest.fn() };
    resourcingRequestsProvider = { getSummary: jest.fn() };
    campaignsProvider = { getSummary: jest.fn() };
    departmentProvider = { getSummary: jest.fn() };
    idpProvider = { getSummary: jest.fn() };
    registry = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ProviderRegistryService>;
    prisma = {
      employee: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardsService,
        { provide: DashboardAudience, useValue: audience },
        { provide: DashboardVariantResolver, useValue: variantResolver },
        { provide: ProviderRegistryService, useValue: registry },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(DashboardsService);
  });

  const mockUmProviders = () => {
    registry.get.mockImplementation((_kind, providerId) => {
      if (providerId === 'risks') {
        return { status: 'available', provider: risksProvider };
      }
      if (providerId === 'action-items') {
        return { status: 'available', provider: actionItemsProvider };
      }
      if (providerId === 'leave') {
        return { status: 'available', provider: leaveProvider };
      }
      if (providerId === 'employment') {
        return { status: 'available', provider: employmentProvider };
      }
      if (providerId === 'resourcing') {
        return { status: 'available', provider: resourcingProvider };
      }
      if (providerId === 'resourcing-requests') {
        return { status: 'available', provider: resourcingRequestsProvider };
      }
      if (providerId === 'campaigns') {
        return { status: 'available', provider: campaignsProvider };
      }
      if (providerId === 'department') {
        return { status: 'available', provider: departmentProvider };
      }
      if (providerId === 'idp') {
        return { status: 'available', provider: idpProvider };
      }
      return { status: 'unavailable' };
    });
  };

  const mockPpProviders = () => {
    registry.get.mockImplementation((_kind, providerId) => {
      if (providerId === 'risks') {
        return { status: 'available', provider: risksProvider };
      }
      if (providerId === 'action-items') {
        return { status: 'available', provider: actionItemsProvider };
      }
      if (providerId === 'leave') {
        return { status: 'available', provider: leaveProvider };
      }
      if (providerId === 'employment') {
        return { status: 'available', provider: employmentProvider };
      }
      if (providerId === 'campaigns') {
        return { status: 'available', provider: campaignsProvider };
      }
      if (providerId === 'department') {
        return { status: 'available', provider: departmentProvider };
      }
      if (providerId === 'idp') {
        return { status: 'available', provider: idpProvider };
      }
      return { status: 'unavailable' };
    });
  };

  it('returns UM config with quick nav and nine counters', async () => {
    variantResolver.resolveVariant.mockResolvedValue({
      variant: 'um',
      resolvedBy: 'functional-role',
    });

    const config = await service.getConfig('um-viewer');

    expect(config.variant).toBe('um');
    expect(config.counters).toHaveLength(9);
    expect(config.quickNav).toHaveLength(6);
  });

  it('returns UM summary scoped to manager subordinates with per-level risk counters', async () => {
    variantResolver.resolveVariant.mockResolvedValue({
      variant: 'um',
      resolvedBy: 'functional-role',
    });
    audience.listManagerSubordinateIds.mockResolvedValue(['sub-1', 'sub-2']);
    mockUmProviders();
    risksProvider.getSummary.mockResolvedValue({
      providerId: 'risks',
      status: 'available',
      counts: {
        need_attention: 0,
        medium: 1,
        high: 1,
        leaver: 0,
        totalActive: 2,
      },
      rows: [
        {
          employeeId: 'sub-1',
          displayName: 'Sub One',
          currentLevel: 'high',
          recordedAt: '2026-01-01',
        },
        {
          employeeId: 'sub-2',
          displayName: 'Sub Two',
          currentLevel: 'medium',
          recordedAt: '2026-01-02',
        },
      ],
    });
    actionItemsProvider.getSummary.mockResolvedValue({
      providerId: 'action-items',
      status: 'available',
      openCount: 4,
      overdueCount: 1,
    });
    leaveProvider.getSummary.mockResolvedValue({
      providerId: 'leave',
      status: 'available',
      cells: {
        'sub-1': { value: '2026-01-01 – 2026-01-10', unavailable: false },
      },
    });
    employmentProvider.getSummary.mockResolvedValue({
      providerId: 'employment',
      status: 'available',
      cells: {
        'sub-1': { value: 'proj-a', unavailable: false },
        'sub-2': { value: 'proj-b', unavailable: false },
      },
    });
    resourcingProvider.getSummary.mockResolvedValue({
      providerId: 'resourcing',
      status: 'available',
      openCount: 2,
    });
    campaignsProvider.getSummary.mockResolvedValue({
      providerId: 'campaigns',
      status: 'available',
      openCount: 1,
    });
    prisma.employee.findMany.mockResolvedValue([
      {
        id: 'sub-1',
        user: { name: 'Sub One', email: 'sub1@example.com' },
      },
      {
        id: 'sub-2',
        user: { name: 'Sub Two', email: 'sub2@example.com' },
      },
    ]);

    const summary = await service.getSummary('um-viewer');

    expect(summary.counters.headcount).toEqual({
      status: 'available',
      value: 2,
    });
    expect(summary.counters.high).toEqual({ status: 'available', value: 1 });
    expect(summary.counters.medium).toEqual({ status: 'available', value: 1 });
    expect(summary.counters.openActionItems).toEqual({
      status: 'available',
      value: 4,
    });
    expect(summary.counters.overdueActionItems).toEqual({
      status: 'available',
      value: 1,
    });
    expect(summary.counters.openResourcingRequests).toEqual({
      status: 'available',
      value: 2,
    });
    expect(summary.counters.openCampaigns).toEqual({
      status: 'available',
      value: 1,
    });
    expect(summary.rows).toHaveLength(2);
    expect(summary.rows?.[0]?.projectLabel).toBe('proj-a');
    expect(summary.pagination).toEqual({
      page: 1,
      pageSize: 50,
      totalRows: 2,
    });
  });

  it('maps missing registry provider to unavailable counter fragments', async () => {
    variantResolver.resolveVariant.mockResolvedValue({
      variant: 'um',
      resolvedBy: 'functional-role',
    });
    audience.listManagerSubordinateIds.mockResolvedValue(['sub-1']);
    registry.get.mockReturnValue({ status: 'unavailable' });
    prisma.employee.findMany.mockResolvedValue([
      {
        id: 'sub-1',
        user: { name: 'Sub One', email: 'sub1@example.com' },
      },
    ]);

    const summary = await service.getSummary('um-viewer');

    expect(summary.counters.high).toEqual({ status: 'unavailable' });
    expect(summary.counters.openCampaigns).toEqual({ status: 'unavailable' });
    expect(summary.rows?.[0]?.risk).toBeUndefined();
  });

  it('maps provider rejection to unavailable counter fragments', async () => {
    variantResolver.resolveVariant.mockResolvedValue({
      variant: 'um',
      resolvedBy: 'functional-role',
    });
    audience.listManagerSubordinateIds.mockResolvedValue(['sub-1']);
    registry.get.mockImplementation((_kind, providerId) => {
      if (providerId === 'risks') {
        return { status: 'available', provider: risksProvider };
      }
      return { status: 'unavailable' };
    });
    risksProvider.getSummary.mockRejectedValue(new ForbiddenException());
    prisma.employee.findMany.mockResolvedValue([
      {
        id: 'sub-1',
        user: { name: 'Sub One', email: 'sub1@example.com' },
      },
    ]);

    const summary = await service.getSummary('um-viewer');

    expect(summary.counters.high).toEqual({ status: 'unavailable' });
  });

  it('paginates UM rows while counters use the full scoped population', async () => {
    variantResolver.resolveVariant.mockResolvedValue({
      variant: 'um',
      resolvedBy: 'functional-role',
    });
    const subjectIds = Array.from({ length: 60 }, (_, index) => `sub-${index}`);
    audience.listManagerSubordinateIds.mockResolvedValue(subjectIds);
    mockUmProviders();
    risksProvider.getSummary.mockResolvedValue({
      providerId: 'risks',
      status: 'available',
      counts: {
        need_attention: 0,
        medium: 0,
        high: 0,
        leaver: 0,
        totalActive: 0,
      },
      rows: [],
    });
    actionItemsProvider.getSummary.mockResolvedValue({
      providerId: 'action-items',
      status: 'available',
      openCount: 0,
      overdueCount: 0,
    });
    leaveProvider.getSummary.mockResolvedValue({
      providerId: 'leave',
      status: 'available',
      cells: {},
    });
    employmentProvider.getSummary.mockResolvedValue({
      providerId: 'employment',
      status: 'available',
      cells: {},
    });
    prisma.employee.findMany.mockResolvedValue(
      subjectIds.map((id) => ({
        id,
        user: { name: id, email: `${id}@example.com` },
      })),
    );

    const summary = await service.getSummary('um-viewer', {
      page: 2,
      pageSize: 50,
    });

    expect(summary.counters.headcount).toEqual({
      status: 'available',
      value: 60,
    });
    expect(summary.rows).toHaveLength(10);
    expect(summary.pagination).toEqual({
      page: 2,
      pageSize: 50,
      totalRows: 60,
    });
    expect(leaveProvider.getSummary.mock.calls[0]).toEqual([
      'um-viewer',
      { subjectIds: subjectIds.slice(50, 60), variant: 'um' },
    ]);
    expect(employmentProvider.getSummary.mock.calls[0]).toEqual([
      'um-viewer',
      { subjectIds: subjectIds.slice(50, 60), variant: 'um' },
    ]);
  });

  it('maps leave stale cells onto table rows', async () => {
    variantResolver.resolveVariant.mockResolvedValue({
      variant: 'um',
      resolvedBy: 'functional-role',
    });
    audience.listManagerSubordinateIds.mockResolvedValue(['sub-1']);
    mockUmProviders();
    risksProvider.getSummary.mockResolvedValue({
      providerId: 'risks',
      status: 'available',
      counts: {
        need_attention: 0,
        medium: 0,
        high: 0,
        leaver: 0,
        totalActive: 0,
      },
      rows: [],
    });
    actionItemsProvider.getSummary.mockResolvedValue({
      providerId: 'action-items',
      status: 'available',
      openCount: 0,
      overdueCount: 0,
    });
    leaveProvider.getSummary.mockResolvedValue({
      providerId: 'leave',
      status: 'available',
      cells: {
        'sub-1': {
          value: '2026-01-01 – 2026-01-10',
          unavailable: false,
          stale: true,
        },
      },
    });
    employmentProvider.getSummary.mockResolvedValue({
      providerId: 'employment',
      status: 'available',
      cells: {},
    });
    resourcingProvider.getSummary.mockResolvedValue({
      providerId: 'resourcing',
      status: 'available',
      openCount: 0,
    });
    campaignsProvider.getSummary.mockResolvedValue({
      providerId: 'campaigns',
      status: 'available',
      openCount: 0,
    });
    prisma.employee.findMany.mockResolvedValue([
      {
        id: 'sub-1',
        user: { name: 'Sub One', email: 'sub1@example.com' },
      },
    ]);

    const summary = await service.getSummary('um-viewer');

    expect(summary.rows?.[0]?.leaveStale).toBe(true);
  });

  it('returns empty rows when page is beyond the last page', async () => {
    variantResolver.resolveVariant.mockResolvedValue({
      variant: 'um',
      resolvedBy: 'functional-role',
    });
    audience.listManagerSubordinateIds.mockResolvedValue(['sub-1', 'sub-2']);
    mockUmProviders();
    risksProvider.getSummary.mockResolvedValue({
      providerId: 'risks',
      status: 'available',
      counts: {
        need_attention: 0,
        medium: 0,
        high: 0,
        leaver: 0,
        totalActive: 0,
      },
      rows: [],
    });
    actionItemsProvider.getSummary.mockResolvedValue({
      providerId: 'action-items',
      status: 'available',
      openCount: 0,
      overdueCount: 0,
    });
    leaveProvider.getSummary.mockResolvedValue({
      providerId: 'leave',
      status: 'available',
      cells: {},
    });
    employmentProvider.getSummary.mockResolvedValue({
      providerId: 'employment',
      status: 'available',
      cells: {},
    });
    resourcingProvider.getSummary.mockResolvedValue({
      providerId: 'resourcing',
      status: 'available',
      openCount: 0,
    });
    campaignsProvider.getSummary.mockResolvedValue({
      providerId: 'campaigns',
      status: 'available',
      openCount: 0,
    });
    prisma.employee.findMany.mockResolvedValue([
      {
        id: 'sub-1',
        user: { name: 'Sub One', email: 'sub1@example.com' },
      },
      {
        id: 'sub-2',
        user: { name: 'Sub Two', email: 'sub2@example.com' },
      },
    ]);

    const summary = await service.getSummary('um-viewer', {
      page: 2,
      pageSize: 50,
    });

    expect(summary.rows).toEqual([]);
    expect(summary.pagination).toEqual({
      page: 2,
      pageSize: 50,
      totalRows: 2,
    });
    expect(summary.counters.headcount).toEqual({
      status: 'available',
      value: 2,
    });
  });

  it('rejects invalid pagination parameters', async () => {
    variantResolver.resolveVariant.mockResolvedValue({
      variant: 'um',
      resolvedBy: 'functional-role',
    });
    audience.listManagerSubordinateIds.mockResolvedValue(['sub-1']);
    mockUmProviders();
    risksProvider.getSummary.mockResolvedValue({
      providerId: 'risks',
      status: 'available',
      counts: {
        need_attention: 0,
        medium: 0,
        high: 0,
        leaver: 0,
        totalActive: 0,
      },
      rows: [],
    });
    actionItemsProvider.getSummary.mockResolvedValue({
      providerId: 'action-items',
      status: 'available',
      openCount: 0,
      overdueCount: 0,
    });
    leaveProvider.getSummary.mockResolvedValue({
      providerId: 'leave',
      status: 'available',
      cells: {},
    });
    employmentProvider.getSummary.mockResolvedValue({
      providerId: 'employment',
      status: 'available',
      cells: {},
    });
    prisma.employee.findMany.mockResolvedValue([
      {
        id: 'sub-1',
        user: { name: 'Sub One', email: 'sub1@example.com' },
      },
    ]);

    await expect(
      service.getSummary('um-viewer', { page: 0, pageSize: 50 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns PM config with the DM six-counter catalog and resourcingRequests block', async () => {
    variantResolver.resolveVariant.mockResolvedValue({
      variant: 'pm',
      resolvedBy: 'functional-role',
    });
    audience.listProjectGroups.mockResolvedValue([]);

    const config = await service.getConfig('pm-viewer');

    expect(config.variant).toBe('pm');
    expect(config.counters.map((counter) => counter.id)).toEqual([
      'headcount',
      'need_attention',
      'medium',
      'high',
      'leaver',
      'openResourcingRequests',
    ]);
    expect(config.blocks).toContain('resourcingRequests');
    expect(config.selectorProjects).toBeUndefined();
  });

  it('returns 403 when viewer has no dashboard variant', async () => {
    variantResolver.resolveVariant.mockResolvedValue({
      variant: null,
      resolvedBy: 'seed-map',
    });

    await expect(service.getConfig('viewer')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('returns project groups for DM variant without pagination metadata', async () => {
    variantResolver.resolveVariant.mockResolvedValue({
      variant: 'dm',
      resolvedBy: 'functional-role',
    });
    audience.listProjectGroups.mockResolvedValue([
      {
        projectId: 'proj-a',
        projectName: 'proj-a',
        subjectIds: ['emp-1'],
      },
      {
        projectId: 'proj-b',
        projectName: 'proj-b',
        subjectIds: [],
      },
    ]);
    registry.get.mockImplementation((_kind, providerId) => {
      if (providerId === 'risks') {
        return { status: 'available', provider: risksProvider };
      }
      if (providerId === 'resourcing') {
        return { status: 'available', provider: resourcingProvider };
      }
      if (providerId === 'resourcing-requests') {
        return { status: 'available', provider: resourcingRequestsProvider };
      }
      if (providerId === 'leave') {
        return { status: 'available', provider: leaveProvider };
      }
      if (providerId === 'employment') {
        return { status: 'available', provider: employmentProvider };
      }
      return { status: 'unavailable' };
    });
    risksProvider.getSummary.mockResolvedValue({
      providerId: 'risks',
      status: 'available',
      counts: {
        need_attention: 0,
        medium: 0,
        high: 0,
        leaver: 0,
        totalActive: 0,
      },
      rows: [],
    });
    resourcingProvider.getSummary.mockResolvedValue({
      providerId: 'resourcing',
      status: 'available',
      openCount: 2,
    });
    resourcingRequestsProvider.getSummary.mockResolvedValue({
      providerId: 'resourcing-requests',
      status: 'available',
      requests: [
        {
          id: 'req-1',
          vacancyDetails: 'Backend engineer',
          status: 'open',
          projectId: 'proj-a',
          authorDisplayName: 'DM Viewer',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    leaveProvider.getSummary.mockResolvedValue({
      providerId: 'leave',
      status: 'available',
      cells: {},
    });
    employmentProvider.getSummary.mockResolvedValue({
      providerId: 'employment',
      status: 'available',
      cells: {},
    });
    prisma.employee.findMany.mockResolvedValue([
      {
        id: 'emp-1',
        user: { name: 'Emp One', email: 'emp1@example.com' },
      },
    ]);

    const summary = await service.getSummary('dm-viewer');

    expect(summary.grouping).toBe('project');
    expect(summary.groups).toHaveLength(2);
    expect(summary.pagination).toBeUndefined();
    expect(summary.counters.openResourcingRequests).toEqual({
      status: 'available',
      value: 2,
    });
    expect(summary.resourcingRequests).toHaveLength(1);
    expect(summary.selectorProjects).toEqual([
      { projectId: 'proj-a', projectName: 'proj-a' },
      { projectId: 'proj-b', projectName: 'proj-b' },
    ]);
  });

  it('deduplicates DM headcount across projects in the all-projects view', async () => {
    variantResolver.resolveVariant.mockResolvedValue({
      variant: 'dm',
      resolvedBy: 'functional-role',
    });
    audience.listProjectGroups.mockResolvedValue([
      {
        projectId: 'proj-a',
        projectName: 'proj-a',
        subjectIds: ['emp-1'],
      },
      {
        projectId: 'proj-b',
        projectName: 'proj-b',
        subjectIds: ['emp-1'],
      },
    ]);
    registry.get.mockImplementation((_kind, providerId) => {
      if (providerId === 'risks') {
        return { status: 'available', provider: risksProvider };
      }
      if (providerId === 'resourcing') {
        return { status: 'available', provider: resourcingProvider };
      }
      if (providerId === 'resourcing-requests') {
        return { status: 'available', provider: resourcingRequestsProvider };
      }
      if (providerId === 'leave') {
        return { status: 'available', provider: leaveProvider };
      }
      if (providerId === 'employment') {
        return { status: 'available', provider: employmentProvider };
      }
      return { status: 'unavailable' };
    });
    risksProvider.getSummary.mockResolvedValue({
      providerId: 'risks',
      status: 'available',
      counts: {
        need_attention: 0,
        medium: 0,
        high: 0,
        leaver: 0,
        totalActive: 0,
      },
      rows: [],
    });
    resourcingProvider.getSummary.mockResolvedValue({
      providerId: 'resourcing',
      status: 'available',
      openCount: 0,
    });
    resourcingRequestsProvider.getSummary.mockResolvedValue({
      providerId: 'resourcing-requests',
      status: 'available',
      requests: [],
    });
    leaveProvider.getSummary.mockResolvedValue({
      providerId: 'leave',
      status: 'available',
      cells: {},
    });
    employmentProvider.getSummary.mockResolvedValue({
      providerId: 'employment',
      status: 'available',
      cells: {},
    });
    prisma.employee.findMany.mockResolvedValue([
      {
        id: 'emp-1',
        user: { name: 'Emp One', email: 'emp1@example.com' },
      },
    ]);

    const summary = await service.getSummary('dm-viewer');

    expect(summary.counters.headcount).toEqual({
      status: 'available',
      value: 1,
    });
    expect(summary.groups?.flatMap((group) => group.rows)).toHaveLength(2);
  });

  it('filters DM summary to a single project when projectId is provided', async () => {
    variantResolver.resolveVariant.mockResolvedValue({
      variant: 'dm',
      resolvedBy: 'functional-role',
    });
    audience.listProjectGroups.mockResolvedValue([
      {
        projectId: 'proj-a',
        projectName: 'proj-a',
        subjectIds: ['emp-1'],
      },
      {
        projectId: 'proj-b',
        projectName: 'proj-b',
        subjectIds: ['emp-2'],
      },
    ]);
    registry.get.mockImplementation((_kind, providerId) => {
      if (providerId === 'risks') {
        return { status: 'available', provider: risksProvider };
      }
      if (providerId === 'resourcing') {
        return { status: 'available', provider: resourcingProvider };
      }
      if (providerId === 'resourcing-requests') {
        return { status: 'available', provider: resourcingRequestsProvider };
      }
      if (providerId === 'leave') {
        return { status: 'available', provider: leaveProvider };
      }
      if (providerId === 'employment') {
        return { status: 'available', provider: employmentProvider };
      }
      return { status: 'unavailable' };
    });
    risksProvider.getSummary.mockResolvedValue({
      providerId: 'risks',
      status: 'available',
      counts: {
        need_attention: 0,
        medium: 0,
        high: 0,
        leaver: 0,
        totalActive: 0,
      },
      rows: [],
    });
    resourcingProvider.getSummary.mockResolvedValue({
      providerId: 'resourcing',
      status: 'available',
      openCount: 1,
    });
    resourcingRequestsProvider.getSummary.mockResolvedValue({
      providerId: 'resourcing-requests',
      status: 'available',
      requests: [],
    });
    leaveProvider.getSummary.mockResolvedValue({
      providerId: 'leave',
      status: 'available',
      cells: {},
    });
    employmentProvider.getSummary.mockResolvedValue({
      providerId: 'employment',
      status: 'available',
      cells: {},
    });
    prisma.employee.findMany.mockResolvedValue([
      {
        id: 'emp-1',
        user: { name: 'Emp One', email: 'emp1@example.com' },
      },
    ]);

    const summary = await service.getSummary('dm-viewer', {
      projectId: 'proj-a',
    });

    expect(summary.groups).toHaveLength(1);
    expect(summary.groups?.[0].projectId).toBe('proj-a');
    expect(summary.counters.headcount).toEqual({
      status: 'available',
      value: 1,
    });
    expect(risksProvider.getSummary.mock.calls[0]).toEqual([
      'dm-viewer',
      {
        subjectIds: ['emp-1'],
        projectId: 'proj-a',
        variant: 'dm',
      },
    ]);
  });

  it('returns zero people counters for DM unassigned project filter', async () => {
    variantResolver.resolveVariant.mockResolvedValue({
      variant: 'dm',
      resolvedBy: 'functional-role',
    });
    audience.listProjectGroups.mockResolvedValue([
      {
        projectId: 'proj-a',
        projectName: 'proj-a',
        subjectIds: ['emp-1'],
      },
    ]);
    registry.get.mockImplementation((_kind, providerId) => {
      if (providerId === 'risks') {
        return { status: 'available', provider: risksProvider };
      }
      if (providerId === 'resourcing') {
        return { status: 'available', provider: resourcingProvider };
      }
      if (providerId === 'resourcing-requests') {
        return { status: 'available', provider: resourcingRequestsProvider };
      }
      return { status: 'unavailable' };
    });
    risksProvider.getSummary.mockResolvedValue({
      providerId: 'risks',
      status: 'available',
      counts: {
        need_attention: 0,
        medium: 0,
        high: 0,
        leaver: 0,
        totalActive: 0,
      },
      rows: [],
    });
    resourcingProvider.getSummary.mockResolvedValue({
      providerId: 'resourcing',
      status: 'available',
      openCount: 1,
    });
    resourcingRequestsProvider.getSummary.mockResolvedValue({
      providerId: 'resourcing-requests',
      status: 'available',
      requests: [],
    });

    const summary = await service.getSummary('dm-viewer', {
      projectId: 'unassigned',
    });

    expect(summary.groups).toEqual([]);
    expect(summary.counters.headcount).toEqual({
      status: 'available',
      value: 0,
    });
  });

  it('rejects blank projectId for DM summary', async () => {
    variantResolver.resolveVariant.mockResolvedValue({
      variant: 'dm',
      resolvedBy: 'functional-role',
    });
    audience.listProjectGroups.mockResolvedValue([]);

    await expect(
      service.getSummary('dm-viewer', { projectId: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns PP config with eight counters, idpDeadlines block, and PP quick nav', async () => {
    variantResolver.resolveVariant.mockResolvedValue({
      variant: 'pp',
      resolvedBy: 'functional-role',
    });

    const config = await service.getConfig('pp-viewer');

    expect(config.variant).toBe('pp');
    expect(config.counters.map((counter) => counter.id)).toEqual([
      'headcount',
      'need_attention',
      'medium',
      'high',
      'leaver',
      'openActionItems',
      'overdueActionItems',
      'openCampaigns',
    ]);
    expect(config.blocks).toEqual([
      'counters',
      'table',
      'idpDeadlines',
      'ownActionItems',
      'quickNav',
    ]);
    expect(config.quickNav.map((link) => link.labelKey)).toEqual([
      'dashboard.quickNav.employees',
      'dashboard.quickNav.risks',
      'dashboard.quickNav.mentorship',
      'dashboard.quickNav.campaigns',
    ]);
    expect(config.quickNav.some((link) => link.path === '/resourcing')).toBe(
      false,
    );
  });

  it('returns PP summary scoped to listPpAssignedIds with department and idp blocks', async () => {
    variantResolver.resolveVariant.mockResolvedValue({
      variant: 'pp',
      resolvedBy: 'functional-role',
    });
    audience.listPpAssignedIds.mockResolvedValue(['assignee-1']);
    mockPpProviders();
    risksProvider.getSummary.mockResolvedValue({
      providerId: 'risks',
      status: 'available',
      counts: {
        need_attention: 0,
        medium: 0,
        high: 0,
        leaver: 0,
        totalActive: 0,
      },
      rows: [],
    });
    actionItemsProvider.getSummary.mockResolvedValue({
      providerId: 'action-items',
      status: 'available',
      openCount: 1,
      overdueCount: 0,
    });
    leaveProvider.getSummary.mockResolvedValue({
      providerId: 'leave',
      status: 'available',
      cells: {},
    });
    employmentProvider.getSummary.mockResolvedValue({
      providerId: 'employment',
      status: 'available',
      cells: {
        'assignee-1': { value: 'proj-a', unavailable: false },
      },
    });
    departmentProvider.getSummary.mockResolvedValue({
      providerId: 'department',
      status: 'available',
      cells: {
        'assignee-1': { value: 'HR', unavailable: false },
      },
    });
    campaignsProvider.getSummary.mockResolvedValue({
      providerId: 'campaigns',
      status: 'available',
      openCount: 2,
    });
    idpProvider.getSummary.mockResolvedValue({
      providerId: 'idp',
      status: 'available',
      rows: [
        {
          id: 'idp-1',
          employeeId: 'assignee-1',
          employeeDisplayName: 'Assignee One',
          description: 'Leadership plan',
          deadline: '2026-09-20',
        },
      ],
    });
    prisma.employee.findMany.mockResolvedValue([
      {
        id: 'assignee-1',
        user: { name: 'Assignee One', email: 'assignee1@example.com' },
      },
    ]);

    const summary = await service.getSummary('pp-viewer');

    expect(audience.listPpAssignedIds.mock.calls[0]).toEqual(['pp-viewer']);
    expect(summary.counters.headcount).toEqual({
      status: 'available',
      value: 1,
    });
    expect(summary.rows?.[0]?.departmentLabel).toBe('HR');
    expect(summary.idpDeadlines).toHaveLength(1);
    expect(summary.pagination).toBeUndefined();
    expect(departmentProvider.getSummary.mock.calls[0]).toEqual([
      'pp-viewer',
      { subjectIds: ['assignee-1'], variant: 'pp' },
    ]);
  });

  it('marks PP department cells unavailable when the department provider fails', async () => {
    variantResolver.resolveVariant.mockResolvedValue({
      variant: 'pp',
      resolvedBy: 'functional-role',
    });
    audience.listPpAssignedIds.mockResolvedValue(['assignee-1']);
    mockPpProviders();
    departmentProvider.getSummary.mockResolvedValue({
      providerId: 'department',
      status: 'unavailable',
    });
    risksProvider.getSummary.mockResolvedValue({
      providerId: 'risks',
      status: 'available',
      counts: {
        need_attention: 0,
        medium: 0,
        high: 0,
        leaver: 0,
        totalActive: 0,
      },
      rows: [],
    });
    actionItemsProvider.getSummary.mockResolvedValue({
      providerId: 'action-items',
      status: 'available',
      openCount: 0,
      overdueCount: 0,
    });
    leaveProvider.getSummary.mockResolvedValue({
      providerId: 'leave',
      status: 'available',
      cells: {},
    });
    employmentProvider.getSummary.mockResolvedValue({
      providerId: 'employment',
      status: 'available',
      cells: {},
    });
    campaignsProvider.getSummary.mockResolvedValue({
      providerId: 'campaigns',
      status: 'available',
      openCount: 0,
    });
    idpProvider.getSummary.mockResolvedValue({
      providerId: 'idp',
      status: 'available',
      rows: [],
    });
    prisma.employee.findMany.mockResolvedValue([
      {
        id: 'assignee-1',
        user: { name: 'Assignee One', email: 'assignee1@example.com' },
      },
    ]);

    const summary = await service.getSummary('pp-viewer');

    expect(summary.rows?.[0]?.departmentStatus).toBe('unavailable');
  });

  it('omits PP idpDeadlines when the idp provider is unavailable', async () => {
    variantResolver.resolveVariant.mockResolvedValue({
      variant: 'pp',
      resolvedBy: 'functional-role',
    });
    audience.listPpAssignedIds.mockResolvedValue([]);
    mockPpProviders();
    risksProvider.getSummary.mockResolvedValue({
      providerId: 'risks',
      status: 'available',
      counts: {
        need_attention: 0,
        medium: 0,
        high: 0,
        leaver: 0,
        totalActive: 0,
      },
      rows: [],
    });
    actionItemsProvider.getSummary.mockResolvedValue({
      providerId: 'action-items',
      status: 'available',
      openCount: 0,
      overdueCount: 0,
    });
    campaignsProvider.getSummary.mockResolvedValue({
      providerId: 'campaigns',
      status: 'available',
      openCount: 0,
    });
    idpProvider.getSummary.mockResolvedValue({
      providerId: 'idp',
      status: 'unavailable',
    });

    const summary = await service.getSummary('pp-viewer');

    expect(summary.idpDeadlines).toBeUndefined();
    expect(summary.counters.headcount).toEqual({
      status: 'available',
      value: 0,
    });
  });
});
