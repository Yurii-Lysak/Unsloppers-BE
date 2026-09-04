import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessResolver } from '../contracts/access-resolver.contract';
import {
  BUILTIN_EDITABLE_FIELD_IDS,
  FieldSpec,
} from '../contracts/field-registry.contract';
import { PermissionChecker } from '../contracts/permission-checker.contract';
import { SectionAccessGate } from '../contracts/section-access-gate.contract';
import { ListEmployeesQueryDto } from './dto/list-employees-query.dto';
import { UpdateEmployeeFieldDto } from './dto/update-employee-field.dto';
import { EmployeeFieldUpdateEntity } from './entities/employee-field-update.entity';
import { EmployeeListEntity } from './entities/employee-list.entity';
import { EmployeeSummaryEntity } from './entities/employee-summary.entity';
import { CustomFieldsService } from './custom-fields.service';
import { CustomFieldVisibilityService } from './custom-field-visibility.service';
import { MANAGE_CUSTOM_FIELDS_PERMISSION } from './directory.constants';
import { FieldRegistryService } from './field-registry.service';

/**
 * Employee directory reads (Story 3.1) and inline field writes (Story 3.3).
 */
@Injectable()
export class EmployeesService {
  constructor(
    private readonly fieldRegistryService: FieldRegistryService,
    private readonly customFieldsService: CustomFieldsService,
    private readonly visibility: CustomFieldVisibilityService,
    private readonly permissionChecker: PermissionChecker,
    private readonly accessResolver: AccessResolver,
    private readonly sectionGate: SectionAccessGate,
    private readonly prisma: PrismaService,
  ) {}

  async listEmployees(
    viewerId: string,
    query: ListEmployeesQueryDto,
  ): Promise<EmployeeListEntity> {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(viewerId);
    const allFields = await this.fieldRegistryService.listFields();
    const visibleFields = await this.filterVisibleFields(
      viewerEmployeeId,
      viewerId,
      allFields,
    );
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
      viewerEmployeeId,
      viewerId,
      result.rows,
      visibleFields,
    );

    const rowsWithWritability = await Promise.all(
      maskedRows.map(async (row) => ({
        ...row,
        writableFieldIds: await this.resolveWritableFieldIds(
          viewerId,
          viewerEmployeeId,
          row.employeeId,
          visibleFields,
        ),
      })),
    );

    return {
      fields: visibleFields,
      rows: rowsWithWritability,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  }

  async updateEmployeeField(
    userId: string,
    employeeId: string,
    fieldId: string,
    dto: UpdateEmployeeFieldDto,
  ): Promise<EmployeeFieldUpdateEntity> {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(userId);
    await this.fieldRegistryService.assertEmployeeExists(employeeId);

    const allFields = await this.fieldRegistryService.listFields();
    const field = allFields.find((entry) => entry.id === fieldId);
    if (!field) {
      throw new NotFoundException(`Field "${fieldId}" not found`);
    }

    const writableFieldIds = await this.resolveWritableFieldIds(
      userId,
      viewerEmployeeId,
      employeeId,
      allFields,
    );
    if (!writableFieldIds.includes(fieldId)) {
      throw new ForbiddenException('Cannot write this field for this employee');
    }

    if (field.source === 'custom') {
      await this.sectionGate.requireSection(
        viewerEmployeeId,
        employeeId,
        'S16',
        'RW',
      );
      const updated = await this.customFieldsService.setValue(
        userId,
        viewerEmployeeId,
        employeeId,
        fieldId,
        { value: dto.value },
      );
      return {
        employeeId,
        fieldId,
        value: updated.value,
      };
    }

    if (field.source === 'builtin' && BUILTIN_EDITABLE_FIELD_IDS.has(fieldId)) {
      await this.fieldRegistryService.setBuiltinFieldValue(
        employeeId,
        fieldId,
        dto.value,
      );
      return {
        employeeId,
        fieldId,
        value: dto.value,
      };
    }

    throw new BadRequestException(`Field "${fieldId}" is not writable`);
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
    viewerEmployeeId: string,
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
          viewerEmployeeId,
          field.visibility,
        ))
      ) {
        visible.push(field);
      }
    }
    return visible;
  }

  private async maskRowCells(
    viewerEmployeeId: string,
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
            viewerEmployeeId,
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

  private async resolveWritableFieldIds(
    userId: string,
    viewerEmployeeId: string,
    employeeId: string,
    visibleFields: FieldSpec[],
  ): Promise<string[]> {
    const writable: string[] = [];

    for (const field of visibleFields) {
      if (!field.editable) {
        continue;
      }

      if (field.source === 'custom' && field.visibility) {
        const canManage = await this.permissionChecker.hasPermission(
          userId,
          MANAGE_CUSTOM_FIELDS_PERMISSION,
        );
        const canWrite =
          canManage ||
          (await this.visibility.canWriteFieldForSubject(
            viewerEmployeeId,
            employeeId,
            field.visibility,
          ));
        if (canWrite) {
          writable.push(field.id);
        }
        continue;
      }

      if (
        field.source === 'builtin' &&
        BUILTIN_EDITABLE_FIELD_IDS.has(field.id)
      ) {
        const audience = await this.accessResolver.resolveAudience(
          viewerEmployeeId,
          employeeId,
        );
        if (audience.sections.S4 === 'RW') {
          writable.push(field.id);
        }
      }
    }

    return writable;
  }

  private async resolveViewerEmployeeId(userId: string): Promise<string> {
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!employee) {
      throw new ForbiddenException('Authenticated user has no employee record');
    }
    return employee.id;
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
