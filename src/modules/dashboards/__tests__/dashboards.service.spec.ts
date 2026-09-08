import { ForbiddenException } from '@nestjs/common';
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

  beforeEach(async () => {
    audience = {
      listManagerSubordinateIds: jest.fn(),
      listProjectGroups: jest.fn(),
    };
    variantResolver = {
      resolveVariant: jest.fn(),
    };
    risksProvider = {
      getSummary: jest.fn(),
    };
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

  it('returns UM config scoped to manager subordinates only', async () => {
    variantResolver.resolveVariant.mockResolvedValue({
      variant: 'um',
      resolvedBy: 'functional-role',
    });
    audience.listManagerSubordinateIds.mockResolvedValue(['sub-1', 'sub-2']);
    registry.get.mockReturnValue({
      status: 'available',
      provider: risksProvider,
    });
    risksProvider.getSummary.mockResolvedValue({
      providerId: 'risks',
      status: 'available',
      counts: {
        need_attention: 0,
        medium: 0,
        high: 1,
        leaver: 0,
        totalActive: 1,
      },
      rows: [
        {
          employeeId: 'sub-1',
          displayName: 'Sub One',
          currentLevel: 'high',
          recordedAt: '2026-01-01',
        },
      ],
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

    expect(audience.listManagerSubordinateIds.mock.calls).toEqual([
      ['um-viewer'],
    ]);
    expect(risksProvider.getSummary.mock.calls).toEqual([
      ['um-viewer', { subjectIds: ['sub-1', 'sub-2'] }],
    ]);
    expect(summary.counters.headcount).toEqual({
      status: 'available',
      value: 2,
    });
    expect(summary.counters.totalActive).toEqual({
      status: 'available',
      value: 1,
    });
    expect(summary.rows).toHaveLength(2);
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

    expect(summary.counters.totalActive).toEqual({ status: 'unavailable' });
    expect(summary.rows?.[0]?.risk).toBeUndefined();
  });

  it('maps provider rejection to unavailable counter fragments', async () => {
    variantResolver.resolveVariant.mockResolvedValue({
      variant: 'um',
      resolvedBy: 'functional-role',
    });
    audience.listManagerSubordinateIds.mockResolvedValue(['sub-1']);
    registry.get.mockReturnValue({
      status: 'available',
      provider: risksProvider,
    });
    risksProvider.getSummary.mockRejectedValue(new ForbiddenException());
    prisma.employee.findMany.mockResolvedValue([
      {
        id: 'sub-1',
        user: { name: 'Sub One', email: 'sub1@example.com' },
      },
    ]);

    const summary = await service.getSummary('um-viewer');

    expect(summary.counters.totalActive).toEqual({ status: 'unavailable' });
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

  it('returns project groups for DM variant', async () => {
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
    registry.get.mockReturnValue({
      status: 'available',
      provider: risksProvider,
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
    expect(summary.groups?.[1]?.rows).toEqual([]);
  });
});
