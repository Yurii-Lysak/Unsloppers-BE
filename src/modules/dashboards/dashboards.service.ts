import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type { User } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardAudience } from '../contracts/dashboard-audience.contract';
import { DashboardSummaryProvider } from '../contracts/dashboard-summary-provider.contract';
import type {
  DashboardRiskCountsFragment,
  DashboardSummaryFragment,
} from '../contracts/dashboard-summary.types';
import { DashboardVariantResolver } from '../contracts/dashboard-variant-resolver.contract';
import { ProviderRegistryService } from '../registry/provider-registry.service';
import { DASHBOARD_VARIANT_DEFINITIONS } from './dashboard-variant-config';
import type { GetDashboardSummaryQueryDto } from './dto/get-dashboard-summary-query.dto';
import type { DashboardConfigEntity } from './entities/dashboard-config.entity';
import type {
  DashboardCounterValueEntity,
  DashboardPaginationEntity,
  DashboardProjectGroupEntity,
  DashboardSummaryEntity,
  DashboardTableRowEntity,
} from './entities/dashboard-summary.entity';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class DashboardsService {
  constructor(
    private readonly variantResolver: DashboardVariantResolver,
    private readonly audience: DashboardAudience,
    private readonly registry: ProviderRegistryService,
    private readonly prisma: PrismaService,
  ) {}

  async getConfig(viewerEmployeeId: string): Promise<DashboardConfigEntity> {
    const resolution =
      await this.variantResolver.resolveVariant(viewerEmployeeId);
    if (!resolution.variant) {
      throw new ForbiddenException(
        'Dashboard is not accessible to this viewer',
      );
    }

    const definition = DASHBOARD_VARIANT_DEFINITIONS[resolution.variant];
    return {
      variant: definition.variant,
      grouping: definition.grouping,
      blocks: definition.blocks,
      counters: definition.counters,
      quickNav: definition.quickNav,
      resolvedBy: resolution.resolvedBy,
    };
  }

  async getSummary(
    viewerEmployeeId: string,
    query: GetDashboardSummaryQueryDto = {},
  ): Promise<DashboardSummaryEntity> {
    const config = await this.getConfig(viewerEmployeeId);
    const subjectIds = await this.resolveSubjectIds(
      viewerEmployeeId,
      config.variant,
    );
    const counterProviderIds = this.collectProviderIds(config.counters);
    const counterFragments = await this.loadProviderFragments(
      viewerEmployeeId,
      subjectIds,
      counterProviderIds,
    );

    const counters = this.buildCounters(
      config.counters,
      subjectIds,
      counterFragments,
    );

    if (config.grouping === 'project') {
      const tableFragments = await this.ensureTableFragments(
        viewerEmployeeId,
        subjectIds,
        counterFragments,
        config.blocks.includes('table'),
      );
      const allRows = await this.buildTableRows(subjectIds, tableFragments);
      const groups = await this.buildProjectGroups(
        viewerEmployeeId,
        config.variant,
        allRows,
      );
      return {
        variant: config.variant,
        grouping: config.grouping,
        counters,
        groups,
      };
    }

    const pagination = this.resolvePeopleTablePagination(
      subjectIds,
      query,
      config.variant,
    );
    const tableFragments = await this.ensureTableFragments(
      viewerEmployeeId,
      pagination.pageSubjectIds,
      counterFragments,
      config.blocks.includes('table'),
    );
    const rows = await this.buildTableRows(
      pagination.pageSubjectIds,
      tableFragments,
    );

    return {
      variant: config.variant,
      grouping: config.grouping,
      counters,
      rows,
      pagination: pagination.meta,
    };
  }

  private collectProviderIds(
    specs: DashboardConfigEntity['counters'],
  ): Set<string> {
    const providerIds = new Set<string>();
    for (const spec of specs) {
      if (spec.providerId !== 'audience') {
        providerIds.add(spec.providerId);
      }
    }
    return providerIds;
  }

  private async resolveSubjectIds(
    viewerEmployeeId: string,
    variant: DashboardConfigEntity['variant'],
  ): Promise<string[]> {
    if (variant === 'um') {
      return this.audience.listManagerSubordinateIds(viewerEmployeeId);
    }

    if (variant === 'dm' || variant === 'pm') {
      const groups = await this.audience.listProjectGroups(
        viewerEmployeeId,
        variant === 'dm' ? 'dm' : 'pm',
      );
      return [...new Set(groups.flatMap((group) => group.subjectIds))];
    }

    return [];
  }

  private buildCounters(
    specs: DashboardConfigEntity['counters'],
    subjectIds: string[],
    fragments: Map<string, DashboardSummaryFragment>,
  ): Record<string, DashboardCounterValueEntity> {
    const counters: Record<string, DashboardCounterValueEntity> = {};

    for (const spec of specs) {
      if (spec.providerId === 'audience') {
        counters[spec.id] = {
          status: 'available',
          value: subjectIds.length,
        };
        continue;
      }

      const fragment = fragments.get(spec.providerId);
      const value = this.resolveCounterValue(spec.id, spec.providerId, fragment);
      if (value === undefined) {
        counters[spec.id] = { status: 'unavailable' };
      } else {
        counters[spec.id] = { status: 'available', value };
      }
    }

    return counters;
  }

  private resolveCounterValue(
    counterId: string,
    providerId: string,
    fragment: DashboardSummaryFragment | undefined,
  ): number | undefined {
    if (!fragment || fragment.status !== 'available') {
      return undefined;
    }

    if (providerId === 'risks' && fragment.providerId === 'risks') {
      const counts: DashboardRiskCountsFragment = fragment.counts;
      if (counterId === 'totalActive') {
        return counts.totalActive;
      }
      if (counterId in counts) {
        return counts[counterId as keyof DashboardRiskCountsFragment];
      }
      return undefined;
    }

    if (
      providerId === 'action-items' &&
      fragment.providerId === 'action-items'
    ) {
      if (counterId === 'openActionItems') {
        return fragment.openCount;
      }
      if (counterId === 'overdueActionItems') {
        return fragment.overdueCount;
      }
      return undefined;
    }

    if (providerId === 'resourcing' && fragment.providerId === 'resourcing') {
      if (counterId === 'openResourcingRequests') {
        return fragment.openCount;
      }
      return undefined;
    }

    if (providerId === 'campaigns' && fragment.providerId === 'campaigns') {
      if (counterId === 'openCampaigns') {
        return fragment.openCount;
      }
      return undefined;
    }

    return undefined;
  }

  private async buildTableRows(
    subjectIds: string[],
    fragments: Map<string, DashboardSummaryFragment>,
  ): Promise<DashboardTableRowEntity[]> {
    if (subjectIds.length === 0) {
      return [];
    }

    const employees = await this.prisma.employee.findMany({
      where: { id: { in: subjectIds } },
      include: { user: { select: { name: true, email: true } } },
    });
    const employeeById = new Map(
      employees.map((employee) => [employee.id, employee]),
    );

    const riskFragment = fragments.get('risks');
    const leaveFragment = fragments.get('leave');
    const employmentFragment = fragments.get('employment');

    const riskByEmployee = new Map<
      string,
      NonNullable<DashboardTableRowEntity['risk']>
    >();
    if (
      riskFragment?.status === 'available' &&
      riskFragment.providerId === 'risks'
    ) {
      for (const row of riskFragment.rows) {
        riskByEmployee.set(row.employeeId, {
          level: row.currentLevel,
          trend: row.trend,
          recordedAt: row.recordedAt,
        });
      }
    }

    return subjectIds.map((employeeId) => {
      const employee = employeeById.get(employeeId);
      const leaveCell =
        leaveFragment?.status === 'available' &&
        leaveFragment.providerId === 'leave'
          ? leaveFragment.cells[employeeId]
          : undefined;
      const projectCell =
        employmentFragment?.status === 'available' &&
        employmentFragment.providerId === 'employment'
          ? employmentFragment.cells[employeeId]
          : undefined;

      return {
        employeeId,
        displayName: employee ? this.displayName(employee.user) : 'Unknown',
        risk: riskByEmployee.get(employeeId),
        leaveStatus:
          leaveCell && !leaveCell.unavailable ? 'available' : 'unavailable',
        leaveLabel:
          leaveCell && !leaveCell.unavailable ? leaveCell.value : undefined,
        leaveStale: leaveCell?.stale,
        projectStatus:
          projectCell && !projectCell.unavailable ? 'available' : 'unavailable',
        projectLabel:
          projectCell && !projectCell.unavailable
            ? projectCell.value
            : undefined,
        projectStale: projectCell?.stale,
      };
    });
  }

  private resolvePeopleTablePagination(
    subjectIds: string[],
    query: GetDashboardSummaryQueryDto,
    variant: DashboardConfigEntity['variant'],
  ): {
    pageSubjectIds: string[];
    meta?: DashboardPaginationEntity;
  } {
    if (variant !== 'um') {
      return { pageSubjectIds: subjectIds };
    }

    const page = query.page ?? DEFAULT_PAGE;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    if (page < 1 || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
      throw new BadRequestException(
        'Invalid pagination parameters for dashboard summary',
      );
    }

    const totalRows = subjectIds.length;
    const start = (page - 1) * pageSize;
    return {
      pageSubjectIds: subjectIds.slice(start, start + pageSize),
      meta: { page, pageSize, totalRows },
    };
  }

  private async ensureTableFragments(
    viewerEmployeeId: string,
    rowSubjectIds: string[],
    existingFragments: Map<string, DashboardSummaryFragment>,
    includeTable: boolean,
  ): Promise<Map<string, DashboardSummaryFragment>> {
    if (!includeTable) {
      return existingFragments;
    }

    const merged = new Map(existingFragments);
    const toLoad = new Set<string>(['leave', 'employment']);

    const existingRisks = merged.get('risks');
    if (!existingRisks || existingRisks.status !== 'available') {
      toLoad.add('risks');
    }

    const loaded = await this.loadProviderFragments(
      viewerEmployeeId,
      rowSubjectIds,
      toLoad,
    );

    for (const [providerId, fragment] of loaded) {
      if (
        providerId === 'risks' &&
        existingRisks?.status === 'available' &&
        existingRisks.providerId === 'risks'
      ) {
        continue;
      }
      merged.set(providerId, fragment);
    }

    return merged;
  }

  private async buildProjectGroups(
    viewerEmployeeId: string,
    variant: DashboardConfigEntity['variant'],
    rows: DashboardTableRowEntity[],
  ): Promise<DashboardProjectGroupEntity[]> {
    const rowByEmployee = new Map(rows.map((row) => [row.employeeId, row]));
    const responsibility = variant === 'pm' ? 'pm' : 'dm';
    const groups = await this.audience.listProjectGroups(
      viewerEmployeeId,
      responsibility,
    );

    return groups.map((group) => ({
      projectId: group.projectId,
      projectName: group.projectName,
      rows: group.subjectIds
        .map((subjectId) => rowByEmployee.get(subjectId))
        .filter((row): row is DashboardTableRowEntity => row !== undefined),
    }));
  }

  private async loadProviderFragments(
    viewerEmployeeId: string,
    subjectIds: string[],
    providerIds: Set<string>,
  ): Promise<Map<string, DashboardSummaryFragment>> {
    const fragments = new Map<string, DashboardSummaryFragment>();
    await Promise.all(
      [...providerIds].map(async (providerId) => {
        fragments.set(
          providerId,
          await this.loadProviderFragment(
            viewerEmployeeId,
            providerId,
            subjectIds,
          ),
        );
      }),
    );
    return fragments;
  }

  private async loadProviderFragment(
    viewerEmployeeId: string,
    providerId: string,
    subjectIds: string[],
  ): Promise<DashboardSummaryFragment> {
    const lookup = this.registry.get<DashboardSummaryProvider>(
      'dashboard-summary',
      providerId,
    );
    if (lookup.status === 'unavailable') {
      return { providerId, status: 'unavailable' };
    }

    try {
      return await lookup.provider.getSummary(viewerEmployeeId, { subjectIds });
    } catch {
      return { providerId, status: 'unavailable' };
    }
  }

  private displayName(user: Pick<User, 'name' | 'email'>): string {
    const name = user.name?.trim();
    if (name) {
      return name;
    }
    if (user.email) {
      return user.email;
    }
    return 'Unknown';
  }
}
