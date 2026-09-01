import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FieldSpec } from '../contracts/field-registry.contract';
import { PermissionChecker } from '../contracts/permission-checker.contract';
import { ListEmployeesQueryDto } from './dto/list-employees-query.dto';
import { EmployeeListEntity } from './entities/employee-list.entity';
import { EmployeeSummaryEntity } from './entities/employee-summary.entity';
import { CustomFieldVisibilityService } from './custom-field-visibility.service';
import { FieldRegistryService } from './field-registry.service';
import { MANAGE_CUSTOM_FIELDS_PERMISSION } from './directory.constants';

/**
 * Minimal employee directory reads for Story 1.5 navigation shell.
 * Story 1.8: summary DTO is S1-safe (`id`, `displayName` only). Full C1
 * per-row column projection lands in Epic 3; browsing all seeded employees
 * remains intentional for Colleague-tier viewers.
 */
@Injectable()
export class EmployeesService {
  constructor(
    private readonly fieldRegistryService: FieldRegistryService,
    private readonly visibility: CustomFieldVisibilityService,
    private readonly permissionChecker: PermissionChecker,
    private readonly prisma: PrismaService,
  ) {}

  async listEmployees(
    viewerId: string,
    query: ListEmployeesQueryDto,
  ): Promise<EmployeeListEntity> {
    const allFields = await this.fieldRegistryService.listFields();
    const visibleFields = await this.filterVisibleFields(viewerId, allFields);
    const visibleFieldIds = visibleFields.map((field) => field.id);

    const result = await this.fieldRegistryService.queryEmployees({
      page: query.page,
      pageSize: query.pageSize,
      sort: query.sort,
      order: query.order,
      filters: query.filters,
      visibleFieldIds,
    });

    const maskedRows = await this.maskRowCells(
      viewerId,
      result.rows,
      visibleFields,
    );

    return {
      fields: visibleFields,
      rows: maskedRows,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  }

  async getById(employeeId: string): Promise<EmployeeSummaryEntity> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        user: { select: { name: true, email: true } },
      },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    return this.toSummary(employee);
  }

  private async filterVisibleFields(
    viewerId: string,
    fields: FieldSpec[],
  ): Promise<FieldSpec[]> {
    const canManage = await this.permissionChecker.hasPermission(
      viewerId,
      MANAGE_CUSTOM_FIELDS_PERMISSION,
    );

    const visible: FieldSpec[] = [];
    for (const field of fields) {
      if (field.source !== 'custom') {
        visible.push(field);
        continue;
      }
      if (canManage) {
        visible.push(field);
        continue;
      }
      if (
        field.visibility &&
        (await this.visibility.canViewFieldDefinition(
          viewerId,
          field.visibility,
        ))
      ) {
        visible.push(field);
      }
    }
    return visible;
  }

  private async maskRowCells(
    viewerId: string,
    rows: EmployeeListEntity['rows'],
    visibleFields: FieldSpec[],
  ): Promise<EmployeeListEntity['rows']> {
    const customFields = visibleFields.filter(
      (field) => field.source === 'custom' && field.visibility,
    );
    if (customFields.length === 0) {
      return rows;
    }

    const canManage = await this.permissionChecker.hasPermission(
      viewerId,
      MANAGE_CUSTOM_FIELDS_PERMISSION,
    );
    if (canManage) {
      return rows;
    }

    const maskedRows: EmployeeListEntity['rows'] = [];
    for (const row of rows) {
      const cells = { ...row.cells };
      for (const field of customFields) {
        if (
          !(await this.visibility.canViewFieldForSubject(
            viewerId,
            row.employeeId,
            field.visibility!,
          ))
        ) {
          delete cells[field.id];
        }
      }
      maskedRows.push({ employeeId: row.employeeId, cells });
    }
    return maskedRows;
  }

  private toSummary(employee: {
    id: string;
    user: { name: string | null; email: string };
  }): EmployeeSummaryEntity {
    return {
      id: employee.id,
      displayName: employee.user.name?.trim() || employee.user.email,
    };
  }
}
