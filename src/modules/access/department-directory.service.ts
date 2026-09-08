import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DepartmentDirectory,
  DepartmentDto,
} from '../contracts/department-directory.contract';
import { Department } from '../../generated/prisma/client';

/**
 * C12 — real implementation, backed by the `Department` Prisma model
 * (Story 6.2). Bootcamp seed (`seedDepartments`) is flat — every row's
 * `parentId` is null — but `getManagedDepartmentIds` still walks nested
 * children so a future hierarchical seed needs no consumer change.
 */
@Injectable()
export class DepartmentDirectoryService extends DepartmentDirectory {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async getDepartmentByName(name: string): Promise<DepartmentDto | null> {
    const row = await this.prisma.department.findUnique({ where: { name } });
    return row ? this.toDto(row) : null;
  }

  async getManagedDepartmentIds(employeeId: string): Promise<string[]> {
    const direct = await this.prisma.department.findMany({
      where: { managerId: employeeId },
      select: { id: true },
    });

    const managedIds = new Set<string>(direct.map((row) => row.id));
    let frontier = [...managedIds];

    while (frontier.length > 0) {
      const children = await this.prisma.department.findMany({
        where: { parentId: { in: frontier } },
        select: { id: true },
      });
      const newIds = children
        .map((row) => row.id)
        .filter((id) => !managedIds.has(id));
      newIds.forEach((id) => managedIds.add(id));
      frontier = newIds;
    }

    return [...managedIds];
  }

  private toDto(row: Department): DepartmentDto {
    return {
      id: row.id,
      name: row.name,
      parentId: row.parentId,
      managerId: row.managerId,
    };
  }
}
