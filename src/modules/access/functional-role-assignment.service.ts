import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  filterCatalogValidKeys,
  PERMISSION_KEYS,
} from '../contracts/permission-keys';
import { PrismaService } from '../../prisma/prisma.service';
import { FunctionalRoleEntity } from './entities/functional-role.entity';

/**
 * Internal write path for `FunctionalRoleAssignment` (Story 1.4). HTTP
 * assignment APIs added in Story 1.5; seed and unit tests also use this.
 */
@Injectable()
export class FunctionalRoleAssignmentService {
  constructor(private readonly prisma: PrismaService) {}

  async listForEmployee(employeeId: string): Promise<FunctionalRoleEntity[]> {
    await this.assertEmployeeExists(employeeId);

    const assignments = await this.prisma.functionalRoleAssignment.findMany({
      where: { employeeId },
      include: {
        role: { include: { permissions: true } },
      },
      orderBy: { role: { name: 'asc' } },
    });

    return assignments.map((assignment) => this.toEntity(assignment.role));
  }

  async setAssignments(
    employeeId: string,
    roleIds: string[],
    options?: { callerUserId?: string },
  ): Promise<FunctionalRoleEntity[]> {
    await this.assertEmployeeExists(employeeId);

    const dedupedRoleIds = [...new Set(roleIds)];

    await this.assertAssignmentAllowed(
      employeeId,
      dedupedRoleIds,
      options?.callerUserId,
    );

    await this.prisma.$transaction(async (tx) => {
      if (dedupedRoleIds.length > 0) {
        const roles = await tx.functionalRole.findMany({
          where: { id: { in: dedupedRoleIds } },
          select: { id: true },
        });
        if (roles.length !== dedupedRoleIds.length) {
          throw new NotFoundException(
            'One or more functional roles were not found',
          );
        }
      }

      const existing = await tx.functionalRoleAssignment.findMany({
        where: { employeeId },
        select: { roleId: true },
      });
      const existingIds = new Set(existing.map((row) => row.roleId));
      const desiredIds = new Set(dedupedRoleIds);

      const toRemove = [...existingIds].filter((id) => !desiredIds.has(id));
      const toAdd = dedupedRoleIds.filter((id) => !existingIds.has(id));

      if (toRemove.length > 0) {
        await tx.functionalRoleAssignment.deleteMany({
          where: {
            employeeId,
            roleId: { in: toRemove },
          },
        });
      }

      for (const roleId of toAdd) {
        await tx.functionalRoleAssignment.create({
          data: { employeeId, roleId },
        });
      }
    });

    return this.listForEmployee(employeeId);
  }

  async assign(
    employeeId: string,
    roleId: string,
    options?: { callerUserId?: string },
  ): Promise<void> {
    await this.assertEmployeeExists(employeeId);
    await this.assertRoleExists(roleId);

    const current = await this.prisma.functionalRoleAssignment.findMany({
      where: { employeeId },
      select: { roleId: true },
    });
    const currentIds = current.map((row) => row.roleId);
    if (!currentIds.includes(roleId)) {
      await this.assertAssignmentAllowed(
        employeeId,
        [...currentIds, roleId],
        options?.callerUserId,
      );
    }

    await this.prisma.functionalRoleAssignment.upsert({
      where: {
        employeeId_roleId: { employeeId, roleId },
      },
      create: { employeeId, roleId },
      update: {},
    });
  }

  async unassign(
    employeeId: string,
    roleId: string,
    options?: { callerUserId?: string },
  ): Promise<void> {
    const existing = await this.prisma.functionalRoleAssignment.findUnique({
      where: { employeeId_roleId: { employeeId, roleId } },
    });
    if (!existing) {
      throw new NotFoundException('Functional role assignment not found');
    }

    const current = await this.prisma.functionalRoleAssignment.findMany({
      where: { employeeId },
      select: { roleId: true },
    });
    const remaining = current
      .map((row) => row.roleId)
      .filter((id) => id !== roleId);
    await this.assertAssignmentAllowed(
      employeeId,
      remaining,
      options?.callerUserId,
    );

    await this.prisma.functionalRoleAssignment.delete({
      where: { id: existing.id },
    });
  }

  private async assertAssignmentAllowed(
    employeeId: string,
    desiredRoleIds: string[],
    callerUserId?: string,
  ): Promise<void> {
    const adminGrantingRoleIds = await this.findAdminGrantingRoleIds();
    if (adminGrantingRoleIds.size === 0) {
      return;
    }

    const desiredAdminRoles = desiredRoleIds.filter((id) =>
      adminGrantingRoleIds.has(id),
    );

    if (callerUserId) {
      const callerEmployee = await this.prisma.employee.findUnique({
        where: { userId: callerUserId },
        select: { id: true },
      });
      if (callerEmployee?.id === employeeId && desiredAdminRoles.length > 0) {
        const callerAlreadyAdmin = await this.employeeHoldsAdminRole(
          employeeId,
          adminGrantingRoleIds,
        );
        if (!callerAlreadyAdmin) {
          throw new ForbiddenException(
            'Cannot grant manage_functional_roles to yourself without already holding it',
          );
        }
      }
    }

    const currentAdminHolders =
      await this.prisma.functionalRoleAssignment.findMany({
        where: { roleId: { in: [...adminGrantingRoleIds] } },
        select: { employeeId: true },
      });
    const holderIds = new Set(currentAdminHolders.map((row) => row.employeeId));

    const employeeWillHoldAdmin = desiredAdminRoles.length > 0;
    if (employeeWillHoldAdmin) {
      holderIds.add(employeeId);
    } else {
      holderIds.delete(employeeId);
    }

    if (holderIds.size === 0) {
      throw new ForbiddenException(
        'Cannot remove the last employee who holds manage_functional_roles',
      );
    }
  }

  private async findAdminGrantingRoleIds(): Promise<Set<string>> {
    const roles = await this.prisma.functionalRole.findMany({
      where: {
        permissions: {
          some: { permissionKey: PERMISSION_KEYS.MANAGE_FUNCTIONAL_ROLES },
        },
      },
      select: { id: true },
    });
    return new Set(roles.map((role) => role.id));
  }

  private async employeeHoldsAdminRole(
    employeeId: string,
    adminGrantingRoleIds: Set<string>,
  ): Promise<boolean> {
    const count = await this.prisma.functionalRoleAssignment.count({
      where: {
        employeeId,
        roleId: { in: [...adminGrantingRoleIds] },
      },
    });
    return count > 0;
  }

  private async assertEmployeeExists(employeeId: string): Promise<void> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
  }

  private async assertRoleExists(roleId: string): Promise<void> {
    const role = await this.prisma.functionalRole.findUnique({
      where: { id: roleId },
      select: { id: true },
    });
    if (!role) {
      throw new NotFoundException('Functional role not found');
    }
  }

  private toEntity(role: {
    id: string;
    name: string;
    isBuiltIn: boolean;
    permissions: { permissionKey: string }[];
  }): FunctionalRoleEntity {
    return {
      id: role.id,
      name: role.name,
      isBuiltIn: role.isBuiltIn,
      permissionKeys: filterCatalogValidKeys(
        role.permissions.map((p) => p.permissionKey),
      ).sort(),
    };
  }
}
