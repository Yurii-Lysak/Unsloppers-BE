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
  let campaignsProvider: jest.Mocked<DashboardSummaryProvider>;

  beforeEach(async () => {
    audience = {
      listManagerSubordinateIds: jest.fn(),
      listProjectGroups: jest.fn(),
    };
    variantResolver = {
      resolveVariant: jest.fn(),
    };
    risksProvider = { getSummary: jest.fn() };
    actionItemsProvider = { getSummary: jest.fn() };
    leaveProvider = { getSummary: jest.fn() };
    employmentProvider = { getSummary: jest.fn() };
    resourcingProvider = { getSummary: jest.fn() };
    campaignsProvider = { getSummary: jest.fn() };
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
      if (providerId === 'campaigns') {
        return { status: 'available', provider: campaignsProvider };
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
    expect(leaveProvider.getSummary).toHaveBeenCalledWith('um-viewer', {
      subjectIds: subjectIds.slice(50, 60),
    });
    expect(employmentProvider.getSummary).toHaveBeenCalledWith('um-viewer', {
      subjectIds: subjectIds.slice(50, 60),
    });
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

    expect(audience.listProjectGroups.mock.calls).toEqual([
      ['dm-viewer', 'dm'],
      ['dm-viewer', 'dm'],
    ]);
    expect(summary.grouping).toBe('project');
    expect(summary.groups).toHaveLength(2);
    expect(summary.pagination).toBeUndefined();
  });
});
