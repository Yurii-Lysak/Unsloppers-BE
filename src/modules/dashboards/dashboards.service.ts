import { ForbiddenException, Injectable } from '@nestjs/common';
import type { User } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardAudience } from '../contracts/dashboard-audience.contract';
import { DashboardSummaryProvider } from '../contracts/dashboard-summary-provider.contract';
import type { DashboardSummaryFragment } from '../contracts/dashboard-summary.types';
import { DashboardVariantResolver } from '../contracts/dashboard-variant-resolver.contract';
import { ProviderRegistryService } from '../registry/provider-registry.service';
import { DASHBOARD_VARIANT_DEFINITIONS } from './dashboard-variant-config';
import type { DashboardConfigEntity } from './entities/dashboard-config.entity';
import type {
  DashboardCounterValueEntity,
  DashboardProjectGroupEntity,
  DashboardSummaryEntity,
  DashboardTableRowEntity,
} from './entities/dashboard-summary.entity';

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
      resolvedBy: resolution.resolvedBy,
    };
  }

  async getSummary(viewerEmployeeId: string): Promise<DashboardSummaryEntity> {
    const config = await this.getConfig(viewerEmployeeId);
    const subjectIds = await this.resolveSubjectIds(
      viewerEmployeeId,
      config.variant,
    );
    const riskFragment = await this.loadProviderFragment(
      viewerEmployeeId,
      'risks',
      subjectIds,
    );

    const counters = this.buildCounters(
      config.counters,
      subjectIds,
      riskFragment,
    );
    const rows = await this.buildTableRows(subjectIds, riskFragment);

    if (config.grouping === 'project') {
      const groups = await this.buildProjectGroups(
        viewerEmployeeId,
        config.variant,
        rows,
      );
      return {
        variant: config.variant,
        grouping: config.grouping,
        counters,
        groups,
      };
    }

    return {
      variant: config.variant,
      grouping: config.grouping,
      counters,
      rows,
    };
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
    riskFragment: DashboardSummaryFragment | null,
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

      if (spec.providerId === 'risks') {
        if (
          riskFragment?.status === 'available' &&
          riskFragment.providerId === 'risks'
        ) {
          counters[spec.id] = {
            status: 'available',
            value: riskFragment.counts.totalActive,
          };
        } else {
          counters[spec.id] = { status: 'unavailable' };
        }
        continue;
      }

      counters[spec.id] = { status: 'unavailable' };
    }

    return counters;
  }

  private async buildTableRows(
    subjectIds: string[],
    riskFragment: DashboardSummaryFragment | null,
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
      return {
        employeeId,
        displayName: employee ? this.displayName(employee.user) : 'Unknown',
        risk: riskByEmployee.get(employeeId),
        leaveStatus: 'unavailable',
        projectStatus: 'unavailable',
      };
    });
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

  private async loadProviderFragment(
    viewerEmployeeId: string,
    providerId: string,
    subjectIds: string[],
  ): Promise<DashboardSummaryFragment | null> {
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
