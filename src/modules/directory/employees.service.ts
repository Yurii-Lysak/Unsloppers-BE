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
import { EmployeeLookupEntity } from './entities/employee-lookup.entity';
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

    const { filters, filtersHidden } = this.resolveEffectiveFilters(
      query.filters,
      allFields,
      visibleFieldIds,
    );

    const result = await this.fieldRegistryService.queryEmployees({
      page: query.page,
      pageSize: query.pageSize,
      sort: query.sort,
      order: query.order,
      filters,
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
      filtersHidden,
    };
  }

  /**
   * Story 3.4 — a shared saved view's stored filters may reference a field
   * this viewer cannot see (e.g. a management-only custom field owned by a
   * manager who shared the view). Rather than 400 the whole list — which
   * would break "the recipient sees only what they're entitled to see" —
   * drop the entire filter set and flag it so the caller can show a notice.
   * A filter referencing a field absent from the catalog entirely still
   * flows through unchanged and 400s via FieldRegistryService — that
   * signals a malformed/unknown field, not a visibility gap.
   */
  private resolveEffectiveFilters(
    filters: ListEmployeesQueryDto['filters'],
    allFields: FieldSpec[],
    visibleFieldIds: string[],
  ): { filters: ListEmployeesQueryDto['filters']; filtersHidden: boolean } {
    if (!filters || filters.length === 0) {
      return { filters, filtersHidden: false };
    }
    const knownFieldIds = new Set(allFields.map((field) => field.id));
    const hasHiddenFieldFilter = filters.some(
      (filter) =>
        knownFieldIds.has(filter.fieldId) &&
        !visibleFieldIds.includes(filter.fieldId),
    );
    if (hasHiddenFieldFilter) {
      return { filters: [], filtersHidden: true };
    }
    return { filters, filtersHidden: false };
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

  /**
   * Story 3.4 — id+name for every employee, for pickers (share dialog) that
   * need the full roster, not a paginated/filtered/masked list-view slice.
   */
  async listLookupOptions(): Promise<EmployeeLookupEntity[]> {
    const employees = await this.prisma.employee.findMany({
      include: { user: { select: { name: true, email: true } } },
    });
    return employees
      .map((employee) => ({
        employeeId: employee.id,
        name: employee.user.name?.trim() || employee.user.email,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
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
        if (
          await this.visibility.canWriteFieldForSubject(
            viewerEmployeeId,
            employeeId,
            field.visibility,
          )
        ) {
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
