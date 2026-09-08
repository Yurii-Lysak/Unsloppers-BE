import { BadRequestException, Injectable } from '@nestjs/common';
import type { RiskLevel, User } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SectionAccessGate } from '../contracts/section-access-gate.contract';
import { ListRiskDashboardQueryDto } from './dto/list-risk-dashboard-query.dto';
import {
  RiskDashboardCountsEntity,
  RiskDashboardEntity,
  RiskDashboardRowEntity,
  RiskDashboardSummaryEntity,
} from './entities/risk-dashboard.entity';
import {
  computeRiskTrend,
  formatRiskCalendarDate,
  RISK_LEVELS,
} from './risk-input';

const ACTIVE_LEVELS: RiskLevel[] = [
  'need_attention',
  'medium',
  'high',
  'leaver',
];

const LEVEL_RANK = new Map<RiskLevel, number>(
  RISK_LEVELS.map((level, index) => [level, index]),
);

type SubjectRiskSnapshot = {
  employeeId: string;
  displayName: string;
  department?: string;
  managerName?: string;
  peoplePartnerName?: string;
  currentLevel: RiskLevel;
  trend?: ReturnType<typeof computeRiskTrend>;
  recordedAt: string;
  managerIdForFilter?: string | null;
  peoplePartnerIdForFilter?: string | null;
  projectIdsForFilter: string[];
};

@Injectable()
export class RisksDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sectionGate: SectionAccessGate,
  ) {}

  async getAccess(viewerEmployeeId: string): Promise<{ canAccess: boolean }> {
    return {
      canAccess:
        await this.sectionGate.canAccessRiskDashboard(viewerEmployeeId),
    };
  }

  async getSummary(
    viewerEmployeeId: string,
  ): Promise<RiskDashboardSummaryEntity> {
    const snapshots = await this.loadSnapshots(viewerEmployeeId);
    return { counts: this.buildCounts(snapshots) };
  }

  async getDashboard(
    viewerEmployeeId: string,
    query: ListRiskDashboardQueryDto,
  ): Promise<RiskDashboardEntity> {
    await this.assertFilterIdsExist(query);

    const snapshots = await this.loadSnapshots(viewerEmployeeId);
    const counts = this.buildCounts(snapshots);

    let filtered = snapshots;
    if (query.level) {
      filtered = filtered.filter((row) => row.currentLevel === query.level);
    }
    if (query.departmentId) {
      filtered = filtered.filter(
        (row) => row.department === query.departmentId,
      );
    }
    if (query.managerId) {
      filtered = filtered.filter(
        (row) => row.managerIdForFilter === query.managerId,
      );
    }
    if (query.peoplePartnerId) {
      filtered = filtered.filter(
        (row) => row.peoplePartnerIdForFilter === query.peoplePartnerId,
      );
    }
    if (query.projectId) {
      filtered = filtered.filter((row) =>
        row.projectIdsForFilter.includes(query.projectId!),
      );
    }

    filtered = [...filtered].sort((a, b) => this.compareRows(a, b));

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const start = (page - 1) * pageSize;
    const pageRows = filtered.slice(start, start + pageSize);

    return {
      counts,
      rows: pageRows.map((row) => this.toRowEntity(row)),
      total: filtered.length,
      page,
      pageSize,
    };
  }

  private async loadSnapshots(
    viewerEmployeeId: string,
  ): Promise<SubjectRiskSnapshot[]> {
    const subjectIds =
      await this.sectionGate.listS6SubjectIds(viewerEmployeeId);
    if (subjectIds.length === 0) {
      return [];
    }

    const riskRecords = await this.prisma.riskRecord.findMany({
      where: { subjectEmployeeId: { in: subjectIds } },
      orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    });

    const latestBySubject = new Map<string, (typeof riskRecords)[number][]>();
    for (const record of riskRecords) {
      const existing = latestBySubject.get(record.subjectEmployeeId);
      if (!existing) {
        latestBySubject.set(record.subjectEmployeeId, [record]);
        continue;
      }
      if (existing.length === 1) {
        existing.push(record);
      }
    }

    const employees = await this.prisma.employee.findMany({
      where: { id: { in: [...latestBySubject.keys()] } },
      include: {
        user: { select: { name: true, email: true } },
        manager: {
          include: { user: { select: { name: true, email: true } } },
        },
        peoplePartner: {
          include: { user: { select: { name: true, email: true } } },
        },
        departmentHistory: {
          where: { effectiveTo: null },
          select: { value: true },
          take: 1,
        },
        projectAssignments: {
          select: { projectId: true },
        },
      },
    });

    const employeeById = new Map(
      employees.map((employee) => [employee.id, employee]),
    );

    const snapshots: SubjectRiskSnapshot[] = [];

    for (const [subjectId, records] of latestBySubject) {
      const employee = employeeById.get(subjectId);
      if (!employee || records.length === 0) {
        continue;
      }

      const current = records[0];
      const previous = records.length >= 2 ? records[1] : undefined;
      snapshots.push({
        employeeId: subjectId,
        displayName: this.displayName(employee.user),
        department: employee.departmentHistory[0]?.value,
        managerName: employee.manager
          ? this.displayName(employee.manager.user)
          : undefined,
        peoplePartnerName: employee.peoplePartner
          ? this.displayName(employee.peoplePartner.user)
          : undefined,
        currentLevel: current.level,
        trend:
          previous !== undefined
            ? computeRiskTrend(current.level, previous.level)
            : undefined,
        recordedAt: formatRiskCalendarDate(current.recordedAt),
        managerIdForFilter: employee.managerId,
        peoplePartnerIdForFilter: employee.peoplePartnerId,
        projectIdsForFilter: employee.projectAssignments.map(
          (assignment) => assignment.projectId,
        ),
      });
    }

    return snapshots;
  }

  private buildCounts(
    snapshots: Pick<SubjectRiskSnapshot, 'currentLevel'>[],
  ): RiskDashboardCountsEntity {
    const counts: RiskDashboardCountsEntity = {
      need_attention: 0,
      medium: 0,
      high: 0,
      leaver: 0,
      totalActive: 0,
    };

    for (const row of snapshots) {
      if (!ACTIVE_LEVELS.includes(row.currentLevel)) {
        continue;
      }
      switch (row.currentLevel) {
        case 'need_attention':
          counts.need_attention += 1;
          break;
        case 'medium':
          counts.medium += 1;
          break;
        case 'high':
          counts.high += 1;
          break;
        case 'leaver':
          counts.leaver += 1;
          break;
      }
      counts.totalActive += 1;
    }

    return counts;
  }

  private compareRows(
    a: Pick<SubjectRiskSnapshot, 'currentLevel' | 'recordedAt'>,
    b: Pick<SubjectRiskSnapshot, 'currentLevel' | 'recordedAt'>,
  ): number {
    const levelDiff =
      (LEVEL_RANK.get(b.currentLevel) ?? 0) -
      (LEVEL_RANK.get(a.currentLevel) ?? 0);
    if (levelDiff !== 0) {
      return levelDiff;
    }
    return b.recordedAt.localeCompare(a.recordedAt);
  }

  private toRowEntity(row: SubjectRiskSnapshot): RiskDashboardRowEntity {
    return {
      employeeId: row.employeeId,
      displayName: row.displayName,
      currentLevel: row.currentLevel,
      trend: row.trend,
      recordedAt: row.recordedAt,
      department: row.department,
      managerName: row.managerName,
      peoplePartnerName: row.peoplePartnerName,
    };
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

  private async assertFilterIdsExist(
    query: ListRiskDashboardQueryDto,
  ): Promise<void> {
    if (query.managerId) {
      const manager = await this.prisma.employee.findUnique({
        where: { id: query.managerId },
        select: { id: true },
      });
      if (!manager) {
        throw new BadRequestException(`managerId ${query.managerId} not found`);
      }
    }

    if (query.peoplePartnerId) {
      const pp = await this.prisma.employee.findUnique({
        where: { id: query.peoplePartnerId },
        select: { id: true },
      });
      if (!pp) {
        throw new BadRequestException(
          `peoplePartnerId ${query.peoplePartnerId} not found`,
        );
      }
    }

    if (query.projectId) {
      const project = await this.prisma.projectAssignment.findFirst({
        where: { projectId: query.projectId },
        select: { projectId: true },
      });
      if (!project) {
        throw new BadRequestException(`projectId ${query.projectId} not found`);
      }
    }
  }
}
