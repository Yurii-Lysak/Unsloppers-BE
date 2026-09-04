import { Injectable } from '@nestjs/common';
import {
  filterCatalogValidKeys,
  isValidPermissionKey,
  PERMISSION_KEYS,
} from '../contracts/permission-keys';
import { PermissionChecker } from '../contracts/permission-checker.contract';
import { PrismaService } from '../../prisma/prisma.service';
import { Clock } from '../../clock/clock.service';

@Injectable()
export class PermissionCheckerService extends PermissionChecker {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {
    super();
  }

  async hasPermission(userId: string, permissionKey: string): Promise<boolean> {
    if (!isValidPermissionKey(permissionKey)) {
      return false;
    }

    const granted = await this.getGrantedPermissions(userId);
    return granted.includes(permissionKey);
  }

  async getGrantedPermissions(userId: string): Promise<readonly string[]> {
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!employee) {
      return [];
    }

    const assignments = await this.prisma.functionalRoleAssignment.findMany({
      where: { employeeId: employee.id },
      select: {
        role: {
          select: {
            permissions: {
              select: { permissionKey: true },
            },
          },
        },
      },
    });

    const grantedKeys = new Set<string>();
    for (const assignment of assignments) {
      for (const permission of assignment.role.permissions) {
        if (isValidPermissionKey(permission.permissionKey)) {
          grantedKeys.add(permission.permissionKey);
        }
      }
    }

    if (await this.hasManagerOrPeoplePartnerDefaultAccess(employee.id)) {
      grantedKeys.add(PERMISSION_KEYS.CREATE_FORM_CAMPAIGNS);
    }

    return filterCatalogValidKeys([...grantedKeys]).sort();
  }

  /**
   * Story 10.1 Design Notes — a second, narrow grant source for exactly
   * `CREATE_FORM_CAMPAIGNS`: manages >=1 direct report or is PP for >=1
   * employee, or an active PM/DM `ProjectAssignment`. Never role-assignment
   * derived, and never widened to any other permission key.
   *
   * "Manages" is direct reports only (`Employee.managerId === employeeId`) —
   * not the transitive `ReportingLine` closure `AccessResolver` walks
   * elsewhere. A `ProjectAssignment` PM/DM row only counts while active
   * (`endDate IS NULL OR endDate >= today`); `confirmed`/freshness are not
   * checked here, unlike `AccessResolverService`'s ProjectLine resolution —
   * this is a narrower, simpler feature-gate check, not a data-access grant.
   * Employment status of the report/PP-assignee is not filtered, matching how
   * functional-role grants are never auto-revoked on departure either.
   */
  private async hasManagerOrPeoplePartnerDefaultAccess(
    employeeId: string,
  ): Promise<boolean> {
    const today = this.todayAsUtcDateOnly();

    const [directReportCount, ppAssigneeCount, activeProjectAssignmentCount] =
      await Promise.all([
        this.prisma.employee.count({ where: { managerId: employeeId } }),
        this.prisma.employee.count({
          where: { peoplePartnerId: employeeId },
        }),
        this.prisma.projectAssignment.count({
          where: {
            AND: [
              { OR: [{ pmId: employeeId }, { dmId: employeeId }] },
              { OR: [{ endDate: null }, { endDate: { gte: today } }] },
            ],
          },
        }),
      ]);

    return (
      directReportCount > 0 ||
      ppAssigneeCount > 0 ||
      activeProjectAssignmentCount > 0
    );
  }

  private todayAsUtcDateOnly(): Date {
    const now = this.clock.now();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
  }
}
