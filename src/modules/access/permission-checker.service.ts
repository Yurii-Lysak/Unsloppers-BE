import { Injectable } from '@nestjs/common';
import { isValidPermissionKey } from '../contracts/permission-keys';
import { PermissionChecker } from '../contracts/permission-checker.contract';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PermissionCheckerService extends PermissionChecker {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async hasPermission(userId: string, permissionKey: string): Promise<boolean> {
    if (!isValidPermissionKey(permissionKey)) {
      return false;
    }

    const employee = await this.prisma.employee.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!employee) {
      return false;
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

    return grantedKeys.has(permissionKey);
  }
}
