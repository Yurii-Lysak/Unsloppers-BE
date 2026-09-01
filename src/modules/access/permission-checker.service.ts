import { Injectable } from '@nestjs/common';
import {
  filterCatalogValidKeys,
  isValidPermissionKey,
} from '../contracts/permission-keys';
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

    return filterCatalogValidKeys([...grantedKeys]).sort();
  }
}
