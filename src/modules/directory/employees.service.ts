import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AccessResolver,
  ResolvedAudience,
} from '../contracts/access-resolver.contract';
import {
  EmployeeDirectory,
  EmployeeDirectoryListResultDto,
  EmployeeDirectoryRowDto,
} from '../contracts/employee-directory.contract';
import {
  BUILTIN_EDITABLE_FIELD_IDS,
  BUILTIN_FIELD_IDS,
  INTEGRATED_LIST_FIELD_IDS,
  PROVIDER_BACKED_FIELD_IDS,
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
import {
  EmployeeListLeaveCell,
  EmployeeListLeavesReader,
} from '../contracts/employee-list-leaves.contract';
import { ProjectAssignment } from '../contracts/project-assignment.contract';
import { ExportEmployeesQueryDto } from './dto/export-employees-query.dto';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MIN_PAGE,
} from '../contracts/employee-list.constants';
import {
  buildExportFilename,
  dedupeColumnIds,
  formatExportCellValue,
} from './employee-export.helpers';
import * as ExcelJS from 'exceljs';

type CdsAudienceContext = {
  audienceCache: Map<string, ResolvedAudience>;
  s12VisibleEmployeeIds?: string[];
  suppressProviderValuesForEmployeeIds?: string[];
};

type ListEmployeesRequest = EmployeeListQueryOptions & {
  audienceCache?: Map<string, ResolvedAudience>;
};

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
    query: ListEmployeesRequest,
  ): Promise<EmployeeDirectoryListResultDto> {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(viewerId);
    const allFields = await this.fieldRegistryService.listFields();
    const visibleFields = await this.filterVisibleFields(
      viewerEmployeeId,
      viewerId,
      allFields,
    );
    const visibleFieldIds = visibleFields.map((field) => field.id);
    const requestedFilters = query.filters ?? [];

    const { filters, filtersHidden } = this.resolveEffectiveFilters(
      requestedFilters,
      allFields,
      visibleFieldIds,
    );

    const effectiveFilterIds = new Set(
      (filters ?? []).map((filter) => filter.fieldId),
    );
    const strippedCdsFilters = requestedFilters.filter(
      (filter) =>
        PROVIDER_BACKED_FIELD_IDS.has(filter.fieldId) &&
        !effectiveFilterIds.has(filter.fieldId),
    );
    if (strippedCdsFilters.length > 0) {
      const page = query.page ?? MIN_PAGE;
      const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
      return {
        fields: visibleFields,
        rows: [],
        total: 0,
        page,
        pageSize,
        filtersHidden,
      };
    }

    this.assertViewerSortAndFilterAccess({ ...query, filters }, visibleFields);

    const cdsAudience = await this.resolveCdsAudienceContext(viewerEmployeeId, {
      filters: filters ?? [],
      sort: query.sort,
      visibleFieldIds,
      audienceCache: query.audienceCache,
    });
    const audienceCache = cdsAudience?.audienceCache;
    const s12VisibleEmployeeIds = cdsAudience?.s12VisibleEmployeeIds;
    const suppressProviderValuesForEmployeeIds =
      cdsAudience?.suppressProviderValuesForEmployeeIds;

    const result = await this.fieldRegistryService.queryEmployees({
      page: query.page,
      pageSize: query.pageSize,
      sort: query.sort,
      order: query.order,
      filters,
      visibleFieldIds,
      employeeIds: s12VisibleEmployeeIds,
      suppressProviderValuesForEmployeeIds,
    });

    // Resolve every page row's audience exactly once, in parallel, up front.
    // maskRowCells/enrichIntegratedFields/resolveWritableFieldIds each used to
    // call resolveAudience independently per row (mask: 1x, enrich: 1x,
    // writability: 1x per editable field) — for a 3-editable-field row that
    // was up to 5 sequential AccessResolver walks per row, run one row at a
    // time. Building one shared cache up front, resolved concurrently, cuts
    // that to exactly one walk per row and lets the 24-row page resolve in
    // parallel instead of serially (see backend defect #05's follow-up).
    const pageAudienceCache = await this.buildAudienceCache(
      viewerEmployeeId,
      result.rows.map((row) => row.employeeId),
      audienceCache,
    );

    const maskedRows = await this.maskRowCells(
      viewerEmployeeId,
      viewerId,
      result.rows,
      visibleFields,
      pageAudienceCache,
    );

    const enrichedRows = await this.enrichIntegratedFields(
      viewerEmployeeId,
      maskedRows,
      visibleFields,
      pageAudienceCache,
    );

    const rowsWithWritability = await Promise.all(
      enrichedRows.map(async (row) => ({
        ...row,
        writableFieldIds: await this.resolveWritableFieldIds(
          viewerEmployeeId,
          row.employeeId,
          visibleFields,
          pageAudienceCache,
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
      ...(result.fieldsUnavailable?.length
        ? { fieldsUnavailable: result.fieldsUnavailable }
        : {}),
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

    const { rows, fieldsUnavailable } = await this.listAllEmployees(viewerId, {
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
          formatExportCellValue(
            row.cells[columnId],
            columnId,
            fieldsUnavailable,
          ),
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
    fieldsUnavailable?: string[];
  }> {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(viewerId);
    const allFields = await this.fieldRegistryService.listFields();
    const visibleFields = await this.filterVisibleFields(
      viewerEmployeeId,
      viewerId,
      allFields,
    );
    const visibleFieldIds = visibleFields.map((field) => field.id);
    const requestedFilters = query.filters ?? [];
    const { filters, filtersHidden: initialFiltersHidden } =
      this.resolveEffectiveFilters(
        requestedFilters,
        allFields,
        visibleFieldIds,
      );
    let filtersHidden = initialFiltersHidden;
    const cdsAudience = await this.resolveCdsAudienceContext(viewerEmployeeId, {
      filters: filters ?? [],
      sort: query.sort,
      visibleFieldIds,
    });

    const allRows: EmployeeDirectoryRowDto[] = [];
    let page = MIN_PAGE;
    let total = 0;
    let fields: FieldSpec[] = visibleFields;
    let fieldsUnavailable: string[] | undefined;

    while (true) {
      const result = await this.listEmployees(viewerId, {
        ...query,
        filters,
        page,
        pageSize: MAX_PAGE_SIZE,
        audienceCache: cdsAudience?.audienceCache,
        employeeIds: cdsAudience?.s12VisibleEmployeeIds,
        suppressProviderValuesForEmployeeIds:
          cdsAudience?.suppressProviderValuesForEmployeeIds,
      });
      fields = result.fields;
      filtersHidden = result.filtersHidden ?? filtersHidden;
      total = result.total;
      if (result.fieldsUnavailable?.length) {
        fieldsUnavailable = result.fieldsUnavailable;
      }
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

    return {
      rows: allRows,
      fields,
      filtersHidden,
      ...(fieldsUnavailable?.length ? { fieldsUnavailable } : {}),
    };
  }

  private async resolveCdsAudienceContext(
    viewerEmployeeId: string,
    options: {
      filters: FieldFilter[];
      sort?: string;
      visibleFieldIds: string[];
      audienceCache?: Map<string, ResolvedAudience>;
    },
  ): Promise<CdsAudienceContext | undefined> {
    const hasCdsFilter = options.filters.some((filter) =>
      PROVIDER_BACKED_FIELD_IDS.has(filter.fieldId),
    );
    const hasCdsSort =
      options.sort !== undefined && PROVIDER_BACKED_FIELD_IDS.has(options.sort);
    const hasCdsColumns = options.visibleFieldIds.some((fieldId) =>
      PROVIDER_BACKED_FIELD_IDS.has(fieldId),
    );
    if (!hasCdsFilter && !hasCdsSort && !hasCdsColumns) {
      return undefined;
    }

    let audienceCache = options.audienceCache;
    if (!audienceCache) {
      const roster = await this.prisma.employee.findMany({
        select: { id: true },
        orderBy: { id: 'asc' },
      });
      audienceCache = await this.buildAudienceCache(
        viewerEmployeeId,
        roster.map((employee) => employee.id),
      );
    }

    const s12VisibleEmployeeIds = hasCdsFilter
      ? [...audienceCache.entries()]
          .filter(([, audience]) => audience.sections.S12 !== 'none')
          .map(([employeeId]) => employeeId)
      : undefined;
    const suppressProviderValuesForEmployeeIds =
      hasCdsSort && !hasCdsFilter
        ? [...audienceCache.entries()]
            .filter(([, audience]) => audience.sections.S12 === 'none')
            .map(([employeeId]) => employeeId)
        : undefined;

    return {
      audienceCache,
      s12VisibleEmployeeIds,
      suppressProviderValuesForEmployeeIds,
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
    if (hiddenFieldFilters.length > 0) {
      return { filters: [], filtersHidden: true };
    }
    return { filters, filtersHidden: false };
  }

  private assertViewerSortAndFilterAccess(
    query: EmployeeListQueryOptions,
    visibleFields: FieldSpec[],
  ): void {
    const visibleFieldById = new Map(
      visibleFields.map((field) => [field.id, field]),
    );

    if (query.sort) {
      const sortField = visibleFieldById.get(query.sort);
      if (!sortField?.sortable) {
        throw new BadRequestException(
          `Field "${query.sort}" is not sortable for this viewer`,
        );
      }
    }

    for (const filter of query.filters ?? []) {
      const field = visibleFieldById.get(filter.fieldId);
      if (field && !field.filterable) {
        throw new BadRequestException(
          `Field "${filter.fieldId}" is not filterable for this viewer`,
        );
      }
    }
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

    if (fieldId === BUILTIN_FIELD_IDS.mentor_status) {
      throw new BadRequestException(
        'mentor_status is a derived read-only field',
      );
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

      if (!elevated && field.id === BUILTIN_FIELD_IDS.years_with_company) {
        continue;
      }

      if (!elevated && field.sectionId === 'S4') {
        if (field.id === BUILTIN_FIELD_IDS.employment_type) {
          visible.push({ ...field, filterable: false, sortable: false });
        }
        continue;
      }

      visible.push(field);
    }
    return visible;
  }

  /**
   * Resolves every id not already present in `cache`, concurrently, and
   * writes the results into it (mutating and returning the same map when one
   * is passed in, so callers building on top of an existing — e.g. CDS —
   * cache keep sharing it). One AccessResolver walk per unique employeeId,
   * regardless of how many downstream consumers need that row's audience.
   */
  private async buildAudienceCache(
    viewerEmployeeId: string,
    employeeIds: string[],
    cache: Map<string, ResolvedAudience> = new Map(),
  ): Promise<Map<string, ResolvedAudience>> {
    const missingIds = [...new Set(employeeIds)].filter((id) => !cache.has(id));
    if (missingIds.length === 0) {
      return cache;
    }
    const resolved = await Promise.all(
      missingIds.map((id) =>
        this.accessResolver.resolveAudience(viewerEmployeeId, id),
      ),
    );
    missingIds.forEach((id, index) => cache.set(id, resolved[index]));
    return cache;
  }

  /**
   * Backs `GET /employees/leaves` (Story 3.6 list-performance follow-up):
   * the list's own response never blocks on TimeTracker (see
   * enrichIntegratedFields) — the client calls this separately with the
   * current page's employee ids and fills the leave column in once it
   * resolves.
   */
  async getLeaveCells(
    viewerId: string,
    employeeIds: string[],
  ): Promise<Record<string, EmployeeListLeaveCell>> {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(viewerId);
    const audienceCache = await this.buildAudienceCache(
      viewerEmployeeId,
      employeeIds,
    );

    const rows = employeeIds
      .map((employeeId) => ({
        employeeId,
        audience: audienceCache.get(employeeId),
      }))
      .filter(
        (entry): entry is { employeeId: string; audience: ResolvedAudience } =>
          entry.audience !== undefined &&
          entry.audience.sections.S10 !== 'none',
      )
      .map(({ employeeId, audience }) => ({
        subjectEmployeeId: employeeId,
        hideLeaveType: audience.role === 'Colleague',
      }));

    if (rows.length === 0) {
      return {};
    }

    const cells = await this.leavesReader.formatListCells(rows);
    return Object.fromEntries(cells);
  }

  private async resolveRowAudience(
    viewerEmployeeId: string,
    employeeId: string,
    cache?: Map<string, ResolvedAudience>,
  ): Promise<ResolvedAudience> {
    const cached = cache?.get(employeeId);
    if (cached) {
      return cached;
    }
    const audience = await this.accessResolver.resolveAudience(
      viewerEmployeeId,
      employeeId,
    );
    cache?.set(employeeId, audience);
    return audience;
  }

  private async maskRowCells(
    viewerEmployeeId: string,
    viewerId: string,
    rows: EmployeeDirectoryRowDto[],
    visibleFields: FieldSpec[],
    audienceCache?: Map<string, ResolvedAudience>,
  ): Promise<EmployeeDirectoryRowDto[]> {
    const canManage = await this.permissionChecker.hasPermission(
      viewerId,
      MANAGE_CUSTOM_FIELDS_PERMISSION,
    );

    return Promise.all(
      rows.map(async (row) => {
        const audience = await this.resolveRowAudience(
          viewerEmployeeId,
          row.employeeId,
          audienceCache,
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

          if (
            field.sectionId &&
            audience.sections[field.sectionId] === 'none'
          ) {
            delete cells[field.id];
          }
        }

        return { employeeId: row.employeeId, cells };
      }),
    );
  }

  private async enrichIntegratedFields(
    viewerEmployeeId: string,
    rows: EmployeeDirectoryRowDto[],
    visibleFields: FieldSpec[],
    audienceCache?: Map<string, ResolvedAudience>,
  ): Promise<EmployeeDirectoryRowDto[]> {
    const integratedFieldIds = visibleFields
      .map((field) => field.id)
      .filter((fieldId) => INTEGRATED_LIST_FIELD_IDS.has(fieldId));
    if (integratedFieldIds.length === 0) {
      return rows;
    }

    const wantsProjectField = integratedFieldIds.includes(
      BUILTIN_FIELD_IDS.project_names,
    );

    // Leave dates are intentionally left unset here (stay null, rendered as
    // "Loading..." by the client) rather than fetched inline. TimeTracker is
    // an external, sometimes slow or unreachable dependency — blocking the
    // whole page load on it is what caused the original hang, and even
    // batched across the page it's still a live external call best kept off
    // the request path. The client fetches GET /employees/leaves separately
    // (see EmployeesService.getLeaveCells) and fills the column in once that
    // resolves, showing "Temporarily unavailable" if it doesn't. Project
    // names stay inline here: that lookup reads the local ProjectAssignment
    // table (populated by a background TimeTracker sync), not a live call.
    return Promise.all(
      rows.map(async (row) => {
        const audience = await this.resolveRowAudience(
          viewerEmployeeId,
          row.employeeId,
          audienceCache,
        );
        const cells = { ...row.cells };

        if (wantsProjectField && audience.sections.S11 !== 'none') {
          cells[BUILTIN_FIELD_IDS.project_names] =
            await this.formatProjectNames(row.employeeId);
        }

        return { employeeId: row.employeeId, cells };
      }),
    );
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
    audienceCache?: Map<string, ResolvedAudience>,
  ): Promise<string[]> {
    const writable: string[] = [];
    // All builtin-editable fields (grade/position/employment_type) gate on
    // the same S4 access level, so every row needs at most one audience
    // resolution here regardless of how many such fields are visible —
    // resolved lazily so rows with no builtin-editable field visible skip it
    // entirely, and cached so it's shared with mask/enrich for this row.
    let builtinAudience: ResolvedAudience | undefined;

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
        builtinAudience ??= await this.resolveRowAudience(
          viewerEmployeeId,
          employeeId,
          audienceCache,
        );
        if (builtinAudience.sections.S4 === 'RW') {
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
