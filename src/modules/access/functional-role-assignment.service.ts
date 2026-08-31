import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Internal write path for `FunctionalRoleAssignment` (Story 1.4). Not exposed
 * via HTTP — Story 1.5 builds assignment UI; seed and unit tests use this.
 */
@Injectable()
export class FunctionalRoleAssignmentService {
  constructor(private readonly prisma: PrismaService) {}

  async assign(employeeId: string, roleId: string): Promise<void> {
    await this.assertEmployeeExists(employeeId);
    await this.assertRoleExists(roleId);

    await this.prisma.functionalRoleAssignment.upsert({
      where: {
        employeeId_roleId: { employeeId, roleId },
      },
      create: { employeeId, roleId },
      update: {},
    });
  }

  async unassign(employeeId: string, roleId: string): Promise<void> {
    const existing = await this.prisma.functionalRoleAssignment.findUnique({
      where: { employeeId_roleId: { employeeId, roleId } },
    });
    if (!existing) {
      throw new NotFoundException('Functional role assignment not found');
    }
    await this.prisma.functionalRoleAssignment.delete({
      where: { id: existing.id },
    });
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
}
