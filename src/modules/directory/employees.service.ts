import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessResolver } from '../contracts/access-resolver.contract';
import {
  EmployeeDirectory,
  EmployeeDirectoryListResultDto,
  EmployeeDirectoryRowDto,
} from '../contracts/employee-directory.contract';
import {
  BUILTIN_EDITABLE_FIELD_IDS,
  BUILTIN_FIELD_IDS,
  INTEGRATED_LIST_FIELD_IDS,
  EmployeeListQueryOptions,
  FieldFilter,
  FieldSpec,
} from '../contracts/field-registry.contract';
import { PermissionChecker } from '../contracts/permission-checker.contract';
import { SectionAccessGate } from '../contracts/section-access-gate.contract';
import { UpdateEmployeeFieldDto } from './dto/update-employee-field.dto';
import { EmployeeFieldUpdateEntity } from './entities/employee-field-update.entity';
import { EmployeeLookupEntity } from './entities/employee-lookup.entity';
import { EmployeeSummaryEntity } from './entities/employee-summary.entity';
import { CustomFieldsService } from './custom-fields.service';
import { CustomFieldVisibilityService } from './custom-field-visibility.service';
import { MANAGE_CUSTOM_FIELDS_PERMISSION } from './directory.constants';
import { FieldRegistryService } from './field-registry.service';
import { ListCatalogAccessService } from './list-catalog-access.service';
import { EmployeeListLeavesReader } from '../contracts/employee-list-leaves.contract';
import { ProjectAssignment } from '../contracts/project-assignment.contract';
import { ExportEmployeesQueryDto } from './dto/export-employees-query.dto';
import { MAX_PAGE_SIZE, MIN_PAGE } from '../contracts/employee-list.constants';
import {
  buildExportFilename,
  dedupeColumnIds,
  formatExportCellValue,
} from './employee-export.helpers';
import * as ExcelJS from 'exceljs';

/**
 * Employee directory reads (Story 3.1) and inline field writes (Story 3.3).
 */
@Injectable()
export class EmployeesService extends EmployeeDirectory {
  constructor(
    private readonly fieldRegistryService: FieldRegistryService,
    private readonly customFieldsService: CustomFieldsService,
    private readonly visibility: CustomFieldVisibilityService,
    private readonly permissionChecker: PermissionChecker,
    private readonly accessResolver: AccessResolver,
    private readonly sectionGate: SectionAccessGate,
    private readonly listCatalogAccess: ListCatalogAccessService,
    private readonly projectAssignment: ProjectAssignment,
    private readonly leavesReader: EmployeeListLeavesReader,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async listEmployees(
    viewerId: string,
    query: EmployeeListQueryOptions,
  ): Promise<EmployeeDirectoryListResultDto> {
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

    const enrichedRows = await this.enrichIntegratedFields(
      viewerEmployeeId,
      maskedRows,
      visibleFields,
    );

    const rowsWithWritability = await Promise.all(
      enrichedRows.map(async (row) => ({
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

  async exportEmployees(
    viewerId: string,
    query: ExportEmployeesQueryDto,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const requestedColumnIds = dedupeColumnIds(query.columns);
    const allFields = await this.fieldRegistryService.listFields();
    const knownFieldIds = new Set(allFields.map((field) => field.id));
    for (const columnId of requestedColumnIds) {
      if (!knownFieldIds.has(columnId)) {
        throw new BadRequestException(`Unknown field "${columnId}"`);
      }
    }

    const viewerEmployeeId = await this.resolveViewerEmployeeId(viewerId);
    const visibleFields = await this.filterVisibleFields(
      viewerEmployeeId,
      viewerId,
      allFields,
    );
    const visibleFieldIds = new Set(visibleFields.map((field) => field.id));
    const exportColumnIds = requestedColumnIds.filter((columnId) =>
      visibleFieldIds.has(columnId),
    );
    if (exportColumnIds.length === 0) {
      throw new BadRequestException('No exportable columns for this viewer');
    }
    const fieldById = new Map(allFields.map((field) => [field.id, field]));

    const { rows } = await this.listAllEmployees(viewerId, {
      sort: query.sort,
      order: query.order,
      filters: query.filters,
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Employees');
    worksheet.addRow(
      exportColumnIds.map(
        (columnId) => fieldById.get(columnId)?.name ?? columnId,
      ),
    );

    for (const row of rows) {
      worksheet.addRow(
        exportColumnIds.map((columnId) =>
          formatExportCellValue(row.cells[columnId]),
        ),
      );
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return {
      buffer,
      filename: buildExportFilename(),
    };
  }

  private async listAllEmployees(
    viewerId: string,
    query: Omit<EmployeeListQueryOptions, 'page' | 'pageSize'>,
  ): Promise<{
    rows: EmployeeDirectoryRowDto[];
    fields: FieldSpec[];
    filtersHidden: boolean;
  }> {
    const allRows: EmployeeDirectoryRowDto[] = [];
    let page = MIN_PAGE;
    let total = 0;
    let fields: FieldSpec[] = [];
    let filtersHidden = false;

    while (true) {
      const result = await this.listEmployees(viewerId, {
        ...query,
        page,
        pageSize: MAX_PAGE_SIZE,
      });
      fields = result.fields;
      filtersHidden = result.filtersHidden ?? false;
      total = result.total;
      allRows.push(
        ...result.rows.map((row) => ({
          employeeId: row.employeeId,
          cells: row.cells,
        })),
      );
      if (allRows.length >= total) {
        break;
      }
      page += 1;
    }

    return { rows: allRows, fields, filtersHidden };
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
    filters: FieldFilter[] | undefined,
    allFields: FieldSpec[],
    visibleFieldIds: string[],
  ): { filters: FieldFilter[] | undefined; filtersHidden: boolean } {
    if (!filters || filters.length === 0) {
      return { filters, filtersHidden: false };
    }
    const knownFieldIds = new Set(allFields.map((field) => field.id));
    const hiddenFieldFilters = filters.filter(
      (filter) =>
        knownFieldIds.has(filter.fieldId) &&
        !visibleFieldIds.includes(filter.fieldId),
    );
    const visibleFilters = filters.filter((filter) =>
      visibleFieldIds.includes(filter.fieldId),
    );
    if (hiddenFieldFilters.length > 0 && visibleFilters.length === 0) {
      throw new BadRequestException(
        `Field "${hiddenFieldFilters[0].fieldId}" is not filterable for this viewer`,
      );
    }
    if (hiddenFieldFilters.length > 0) {
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
    const { sections: catalogSections, elevated } =
      await this.listCatalogAccess.resolveCatalogAccess(viewerEmployeeId);
    const canManage = await this.permissionChecker.hasPermission(
      viewerId,
      MANAGE_CUSTOM_FIELDS_PERMISSION,
    );

    const visible: FieldSpec[] = [];
    for (const field of fields) {
      if (field.source === 'custom') {
        if (!catalogSections.has('S16')) {
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
        continue;
      }

      if (!field.sectionId || !catalogSections.has(field.sectionId)) {
        continue;
      }

      if (
        !elevated &&
        field.id === BUILTIN_FIELD_IDS.years_with_company
      ) {
        continue;
      }

      if (!elevated && field.sectionId === 'S4') {
        visible.push({ ...field, filterable: false, sortable: false });
        continue;
      }

      visible.push(field);
    }
    return visible;
  }

  private async maskRowCells(
    viewerEmployeeId: string,
    viewerId: string,
    rows: EmployeeDirectoryRowDto[],
    visibleFields: FieldSpec[],
  ): Promise<EmployeeDirectoryRowDto[]> {
    const canManage = await this.permissionChecker.hasPermission(
      viewerId,
      MANAGE_CUSTOM_FIELDS_PERMISSION,
    );

    const maskedRows: EmployeeDirectoryRowDto[] = [];
    for (const row of rows) {
      const audience = await this.accessResolver.resolveAudience(
        viewerEmployeeId,
        row.employeeId,
      );
      const cells = { ...row.cells };

      for (const field of visibleFields) {
        if (field.source === 'custom' && field.visibility) {
          if (canManage) {
            continue;
          }
          if (
            !(await this.visibility.canViewFieldForSubject(
              viewerEmployeeId,
              row.employeeId,
              field.visibility,
            ))
          ) {
            delete cells[field.id];
          }
          continue;
        }

        if (field.sectionId && audience.sections[field.sectionId] === 'none') {
          delete cells[field.id];
        }
      }

      maskedRows.push({ employeeId: row.employeeId, cells });
    }
    return maskedRows;
  }

  private async enrichIntegratedFields(
    viewerEmployeeId: string,
    rows: EmployeeDirectoryRowDto[],
    visibleFields: FieldSpec[],
  ): Promise<EmployeeDirectoryRowDto[]> {
    const integratedFieldIds = visibleFields
      .map((field) => field.id)
      .filter((fieldId) => INTEGRATED_LIST_FIELD_IDS.has(fieldId));
    if (integratedFieldIds.length === 0) {
      return rows;
    }

    const enrichedRows: EmployeeDirectoryRowDto[] = [];
    for (const row of rows) {
      const audience = await this.accessResolver.resolveAudience(
        viewerEmployeeId,
        row.employeeId,
      );
      const cells = { ...row.cells };

      if (
        integratedFieldIds.includes(BUILTIN_FIELD_IDS.current_leave_dates) &&
        audience.sections.S10 !== 'none'
      ) {
        const leaveCell = await this.leavesReader.formatListCell(
          row.employeeId,
          audience.role === 'Colleague',
        );
        cells[BUILTIN_FIELD_IDS.current_leave_dates] = leaveCell.value;
      }

      if (
        integratedFieldIds.includes(BUILTIN_FIELD_IDS.project_names) &&
        audience.sections.S11 !== 'none'
      ) {
        cells[BUILTIN_FIELD_IDS.project_names] =
          await this.formatProjectNames(row.employeeId);
      }

      enrichedRows.push({ employeeId: row.employeeId, cells });
    }

    return enrichedRows;
  }

  private async formatProjectNames(subjectEmployeeId: string): Promise<string> {
    const assignments =
      await this.projectAssignment.listByEmployee(subjectEmployeeId);
    if (assignments.length === 0) {
      return '';
    }
    return assignments.map((row) => row.projectId).join(', ');
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
