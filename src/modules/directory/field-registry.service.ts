import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  CustomFieldDefinition,
  CustomFieldType,
  Prisma,
} from '../../generated/prisma/client';
import { Clock } from '../../clock/clock.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BUILTIN_EDITABLE_FIELD_IDS,
  BUILTIN_FIELD_IDS,
  EmployeeListQueryOptions,
  EmployeeListQueryResultDto,
  EmployeeRowDto,
  FieldDefinitionDto,
  FieldFilter,
  FieldQueryOptions,
  FieldQueryResultDto,
  FieldRegistry,
  FieldSpec,
  FieldValue,
  FieldValueType,
  FieldVisibility,
} from '../contracts/field-registry.contract';
import { FieldProvider } from '../contracts/field-provider.contract';
import { ProviderRegistryService } from '../registry/provider-registry.service';
import {
  BUILTIN_FIELD_SPECS,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MIN_PAGE,
} from './field-catalog';
import {
  allowedOperatorsForField,
  applyFilters,
  currentHistoryValue,
  earliestDate,
  EmployeeSnapshot,
  getCellValue,
  HistoryRowSnapshot,
  isBuiltinFieldId,
  isProviderBackedFieldId,
  sortSnapshots,
} from './employee-query.helpers';

const SELECT_TYPES: CustomFieldType[] = ['select', 'multi_select'];

@Injectable()
export class FieldRegistryService extends FieldRegistry {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly registry: ProviderRegistryService,
  ) {
    super();
  }

  async defineField(
    name: string,
    type: FieldValueType,
    visibility: FieldVisibility,
    options: string[] = [],
  ): Promise<string> {
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new BadRequestException('Field name is required');
    }

    const normalizedOptions = this.normalizeSelectOptions(type, options);

    try {
      const created = await this.prisma.customFieldDefinition.create({
        data: {
          name: trimmedName,
          type: type,
          visibility: visibility,
          options: SELECT_TYPES.includes(type)
            ? normalizedOptions
            : Prisma.JsonNull,
        },
      });
      return created.id;
    } catch (error) {
      this.rethrowKnownErrors(error);
    }
  }

  async setValue(
    employeeId: string,
    fieldId: string,
    value: FieldValue,
  ): Promise<void> {
    const definition = await this.prisma.customFieldDefinition.findUnique({
      where: { id: fieldId },
    });
    if (!definition) {
      throw new NotFoundException(`Custom field "${fieldId}" not found`);
    }

    await this.assertEmployeeExists(employeeId);
    this.validateValueForDefinition(definition, value);

    if (value === null) {
      await this.prisma.customFieldValue.deleteMany({
        where: { employeeId, fieldDefinitionId: fieldId },
      });
      return;
    }

    const data = this.toStorageColumns(definition.type, value);

    try {
      await this.prisma.customFieldValue.upsert({
        where: {
          employeeId_fieldDefinitionId: {
            employeeId,
            fieldDefinitionId: fieldId,
          },
        },
        create: {
          employeeId,
          fieldDefinitionId: fieldId,
          ...data,
        },
        update: {
          ...data,
          valueText: data.valueText ?? null,
          valueNumber: data.valueNumber ?? null,
          valueDate: data.valueDate ?? null,
          valueBoolean: data.valueBoolean ?? null,
          valueSelect: data.valueSelect ?? null,
        },
      });
    } catch (error) {
      this.rethrowKnownErrors(error);
    }
  }

  /**
   * Append a new effective-dated history row for an inline-editable built-in field.
   * Only `grade`, `position`, and `employment_type` are permitted (Story 3.3 / AD-14).
   */
  async setBuiltinFieldValue(
    employeeId: string,
    fieldId: string,
    value: FieldValue,
  ): Promise<void> {
    if (!BUILTIN_EDITABLE_FIELD_IDS.has(fieldId)) {
      throw new BadRequestException(`Field "${fieldId}" is not writable`);
    }
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException('Expected a non-empty text value');
    }

    await this.assertEmployeeExists(employeeId);
    const trimmed = value.trim();
    const effectiveFrom = this.clock.now();

    switch (fieldId) {
      case BUILTIN_FIELD_IDS.grade:
        await this.prisma.gradeHistory.create({
          data: { employeeId, value: trimmed, effectiveFrom },
        });
        return;
      case BUILTIN_FIELD_IDS.position:
        await this.prisma.positionHistory.create({
          data: { employeeId, value: trimmed, effectiveFrom },
        });
        return;
      case BUILTIN_FIELD_IDS.employment_type:
        await this.prisma.employmentTypeHistory.create({
          data: { employeeId, value: trimmed, effectiveFrom },
        });
        return;
      default:
        throw new BadRequestException(`Field "${fieldId}" is not writable`);
    }
  }

  async query(options: FieldQueryOptions): Promise<FieldQueryResultDto[]> {
    if (options.employeeIds?.length === 0 || options.fieldIds?.length === 0) {
      return [];
    }

    const rows = await this.prisma.customFieldValue.findMany({
      where: {
        ...(options.employeeIds?.length
          ? { employeeId: { in: options.employeeIds } }
          : {}),
        ...(options.fieldIds?.length
          ? { fieldDefinitionId: { in: options.fieldIds } }
          : {}),
      },
      include: { fieldDefinition: true },
    });

    return rows.map((row) => ({
      employeeId: row.employeeId,
      fieldId: row.fieldDefinitionId,
      value: this.fromStorageRow(row.fieldDefinition.type, row),
    }));
  }

  async listDefinitions(): Promise<FieldDefinitionDto[]> {
    const rows = await this.prisma.customFieldDefinition.findMany({
      orderBy: { name: 'asc' },
    });
    return rows.map((row) => this.toDefinitionDto(row));
  }

  async getDefinition(fieldId: string): Promise<FieldDefinitionDto> {
    const row = await this.prisma.customFieldDefinition.findUnique({
      where: { id: fieldId },
    });
    if (!row) {
      throw new NotFoundException(`Custom field "${fieldId}" not found`);
    }
    return this.toDefinitionDto(row);
  }

  private toDefinitionDto(row: CustomFieldDefinition): FieldDefinitionDto {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      visibility: row.visibility,
      options: this.parseOptions(row.options),
    };
  }

  private parseOptions(options: Prisma.JsonValue | null): string[] {
    if (!options || !Array.isArray(options)) {
      return [];
    }
    return options.filter((item): item is string => typeof item === 'string');
  }

  private normalizeSelectOptions(
    type: FieldValueType,
    options: string[],
  ): string[] {
    if (!SELECT_TYPES.includes(type)) {
      if (options.length > 0) {
        throw new BadRequestException(
          'Options are only allowed for select and multi_select fields',
        );
      }
      return [];
    }
    if (options.length === 0) {
      throw new BadRequestException(
        'Select fields require at least one option',
      );
    }
    const normalized = options.map((option) => option.trim());
    if (normalized.some((option) => option.length === 0)) {
      throw new BadRequestException('Select options cannot be empty');
    }
    if (new Set(normalized).size !== normalized.length) {
      throw new BadRequestException('Select options must be unique');
    }
    return normalized;
  }

  private validateValueForDefinition(
    definition: CustomFieldDefinition,
    value: FieldValue,
  ): void {
    if (value === null) {
      return;
    }

    const options = this.parseOptions(definition.options);

    switch (definition.type) {
      case 'text':
        if (typeof value !== 'string') {
          throw new BadRequestException('Expected a text value');
        }
        return;
      case 'number':
        if (typeof value !== 'number' || Number.isNaN(value)) {
          throw new BadRequestException('Expected a numeric value');
        }
        return;
      case 'date':
        if (
          typeof value !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
          Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
        ) {
          throw new BadRequestException(
            'Expected an ISO date string (YYYY-MM-DD)',
          );
        }
        return;
      case 'boolean':
        if (typeof value !== 'boolean') {
          throw new BadRequestException('Expected a boolean value');
        }
        return;
      case 'select':
        if (typeof value !== 'string' || !options.includes(value)) {
          throw new BadRequestException(
            'Value must be one of the field options',
          );
        }
        return;
      case 'multi_select': {
        if (
          !Array.isArray(value) ||
          value.some((item) => typeof item !== 'string')
        ) {
          throw new BadRequestException('Expected an array of option strings');
        }
        if (value.some((item) => !options.includes(item))) {
          throw new BadRequestException('Value must use defined options only');
        }
        if (new Set(value).size !== value.length) {
          throw new BadRequestException('Multi-select values must be unique');
        }
        return;
      }
      default: {
        const _exhaustive: never = definition.type;
        void _exhaustive;
        throw new BadRequestException('Unsupported field type');
      }
    }
  }

  private toStorageColumns(
    type: CustomFieldType,
    value: FieldValue,
  ): {
    valueText: string | null;
    valueNumber: Prisma.Decimal | null;
    valueDate: Date | null;
    valueBoolean: boolean | null;
    valueSelect: string | null;
  } {
    const empty = {
      valueText: null,
      valueNumber: null,
      valueDate: null,
      valueBoolean: null,
      valueSelect: null,
    };

    if (value === null) {
      return empty;
    }

    switch (type) {
      case 'text':
        return { ...empty, valueText: value as string };
      case 'number':
        return {
          ...empty,
          valueNumber: new Prisma.Decimal(value as number),
        };
      case 'date': {
        const [year, month, day] = (value as string).split('-').map(Number);
        return {
          ...empty,
          valueDate: new Date(Date.UTC(year, month - 1, day)),
        };
      }
      case 'boolean':
        return { ...empty, valueBoolean: value as boolean };
      case 'select':
        return { ...empty, valueSelect: value as string };
      case 'multi_select':
        return {
          ...empty,
          valueText: JSON.stringify(value),
        };
      default: {
        const _exhaustive: never = type;
        void _exhaustive;
        throw new BadRequestException('Unsupported field type');
      }
    }
  }

  private fromStorageRow(
    type: CustomFieldType,
    row: {
      valueText: string | null;
      valueNumber: Prisma.Decimal | null;
      valueDate: Date | null;
      valueBoolean: boolean | null;
      valueSelect: string | null;
    },
  ): FieldValue {
    switch (type) {
      case 'text':
        return row.valueText;
      case 'number':
        return row.valueNumber === null ? null : row.valueNumber.toNumber();
      case 'date':
        if (row.valueDate === null) {
          return null;
        }
        return row.valueDate.toISOString().slice(0, 10);
      case 'boolean':
        return row.valueBoolean;
      case 'select':
        return row.valueSelect;
      case 'multi_select':
        if (row.valueText === null) {
          return null;
        }
        try {
          const parsed: unknown = JSON.parse(row.valueText);
          if (
            !Array.isArray(parsed) ||
            parsed.some((item) => typeof item !== 'string')
          ) {
            return null;
          }
          return parsed.filter(
            (item): item is string => typeof item === 'string',
          );
        } catch {
          return null;
        }
      default: {
        const _exhaustive: never = type;
        void _exhaustive;
        throw new BadRequestException('Unsupported field type');
      }
    }
  }

  async assertEmployeeExists(employeeId: string): Promise<void> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true },
    });
    if (!employee) {
      throw new NotFoundException(`Employee "${employeeId}" not found`);
    }
  }

  async listFields(): Promise<FieldSpec[]> {
    const customDefinitions = await this.prisma.customFieldDefinition.findMany({
      orderBy: { name: 'asc' },
    });

    const customFields: FieldSpec[] = customDefinitions.map((definition) => ({
      id: definition.id,
      name: definition.name,
      type: definition.type,
      source: 'custom',
      sectionId: 'S16',
      sortable: true,
      filterable: true,
      editable: true,
      visibility: definition.visibility,
      options: this.parseOptions(definition.options),
    }));

    return [...BUILTIN_FIELD_SPECS, ...customFields];
  }

  async queryEmployees(
    options: EmployeeListQueryOptions,
  ): Promise<EmployeeListQueryResultDto> {
    const page = options.page ?? MIN_PAGE;
    const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;

    if (!Number.isInteger(page) || page < MIN_PAGE) {
      throw new BadRequestException('Invalid page');
    }
    if (
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > MAX_PAGE_SIZE
    ) {
      throw new BadRequestException('Invalid pageSize');
    }

    const allFields = await this.listFields();
    const fieldById = new Map(allFields.map((field) => [field.id, field]));
    const visibleFieldIds =
      options.visibleFieldIds ?? allFields.map((field) => field.id);

    for (const fieldId of visibleFieldIds) {
      if (!fieldById.has(fieldId)) {
        throw new BadRequestException(`Unknown field "${fieldId}"`);
      }
    }

    const filters = options.filters ?? [];
    this.validateFilters(filters, fieldById, visibleFieldIds);

    const sortFieldId = options.sort;
    const sortOrder = options.order ?? 'asc';
    if (sortFieldId) {
      const sortField = fieldById.get(sortFieldId);
      if (!sortField || !visibleFieldIds.includes(sortFieldId)) {
        throw new BadRequestException(
          `Field "${sortFieldId}" is not sortable for this viewer`,
        );
      }
      if (!sortField.sortable) {
        throw new BadRequestException(`Field "${sortFieldId}" is not sortable`);
      }
    }

    const asOf = this.clock.now();
    let snapshots = await this.loadEmployeeSnapshots();

    if (options.employeeIds) {
      const allowedIds = new Set(options.employeeIds);
      snapshots = snapshots.filter((snapshot) =>
        allowedIds.has(snapshot.employeeId),
      );
    }

    const queryableFieldIds = this.collectQueryableFieldIds(
      visibleFieldIds,
      filters,
      sortFieldId,
    );
    const customFieldIds = queryableFieldIds.filter(
      (fieldId) => !isProviderBackedFieldId(fieldId),
    );
    const providerFieldIds = queryableFieldIds.filter((fieldId) =>
      isProviderBackedFieldId(fieldId),
    );

    const customValueMap = await this.loadCustomValueMap(
      snapshots,
      customFieldIds,
    );
    const { valueMap: providerValueMap, fieldsUnavailable } =
      await this.loadProviderValueMap(snapshots, providerFieldIds, filters);
    const valueMap = new Map([...customValueMap, ...providerValueMap]);
    if (options.suppressProviderValuesForEmployeeIds?.length) {
      const suppressed = new Set(options.suppressProviderValuesForEmployeeIds);
      for (const fieldId of providerFieldIds) {
        for (const employeeId of suppressed) {
          valueMap.set(`${employeeId}:${fieldId}`, null);
        }
      }
    }

    snapshots = applyFilters(snapshots, filters, fieldById, asOf, valueMap);

    if (sortFieldId) {
      snapshots = sortSnapshots(
        snapshots,
        sortFieldId,
        sortOrder,
        asOf,
        valueMap,
      );
    } else {
      snapshots = sortSnapshots(
        snapshots,
        BUILTIN_FIELD_SPECS[0].id,
        'asc',
        asOf,
        valueMap,
      );
    }

    const total = snapshots.length;
    const offset = (page - 1) * pageSize;
    const pageSnapshots = snapshots.slice(offset, offset + pageSize);

    const rows: EmployeeRowDto[] = pageSnapshots.map((snapshot) => {
      const cells: Record<string, FieldValue> = {};
      for (const fieldId of visibleFieldIds) {
        if (fieldsUnavailable.includes(fieldId)) {
          continue;
        }
        cells[fieldId] = getCellValue(snapshot, fieldId, asOf, valueMap);
      }
      return { employeeId: snapshot.employeeId, cells };
    });

    return {
      rows,
      total,
      page,
      pageSize,
      ...(fieldsUnavailable.length > 0 ? { fieldsUnavailable } : {}),
    };
  }

  private collectQueryableFieldIds(
    visibleFieldIds: string[],
    filters: FieldFilter[],
    sortFieldId: string | undefined,
  ): string[] {
    const ids = new Set<string>();
    const maybeAdd = (fieldId: string) => {
      if (!isBuiltinFieldId(fieldId) || isProviderBackedFieldId(fieldId)) {
        ids.add(fieldId);
      }
    };
    for (const fieldId of visibleFieldIds) {
      maybeAdd(fieldId);
    }
    for (const filter of filters) {
      maybeAdd(filter.fieldId);
    }
    if (sortFieldId) {
      maybeAdd(sortFieldId);
    }
    return [...ids];
  }

  private async loadProviderValueMap(
    snapshots: EmployeeSnapshot[],
    providerFieldIds: string[],
    filters: FieldFilter[],
  ): Promise<{
    valueMap: Map<string, FieldValue>;
    fieldsUnavailable: string[];
  }> {
    const valueMap = new Map<string, FieldValue>();
    const fieldsUnavailable: string[] = [];
    if (providerFieldIds.length === 0 || snapshots.length === 0) {
      return { valueMap, fieldsUnavailable };
    }

    const employeeIds = snapshots.map((snapshot) => snapshot.employeeId);
    for (const fieldId of providerFieldIds) {
      const lookup = this.registry.get<FieldProvider>('field', fieldId);
      if (lookup.status === 'unavailable') {
        fieldsUnavailable.push(fieldId);
        if (filters.some((filter) => filter.fieldId === fieldId)) {
          throw new ServiceUnavailableException(
            `Field "${fieldId}" is temporarily unavailable`,
          );
        }
        continue;
      }

      try {
        const results = await lookup.provider.queryValues(employeeIds);
        for (const entry of results) {
          valueMap.set(`${entry.employeeId}:${entry.fieldId}`, entry.value);
        }
      } catch {
        fieldsUnavailable.push(fieldId);
        if (filters.some((filter) => filter.fieldId === fieldId)) {
          throw new ServiceUnavailableException(
            `Field "${fieldId}" is temporarily unavailable`,
          );
        }
      }
    }

    return { valueMap, fieldsUnavailable };
  }

  private async loadCustomValueMap(
    snapshots: EmployeeSnapshot[],
    customFieldIds: string[],
  ): Promise<Map<string, FieldValue>> {
    const customValueMap = new Map<string, FieldValue>();
    if (customFieldIds.length === 0 || snapshots.length === 0) {
      return customValueMap;
    }

    const customValues = await this.query({
      employeeIds: snapshots.map((snapshot) => snapshot.employeeId),
      fieldIds: customFieldIds,
    });
    for (const entry of customValues) {
      customValueMap.set(`${entry.employeeId}:${entry.fieldId}`, entry.value);
    }
    return customValueMap;
  }

  private validateFilters(
    filters: FieldFilter[],
    fieldById: Map<string, FieldSpec>,
    visibleFieldIds: string[],
  ): void {
    for (const filter of filters) {
      const field = fieldById.get(filter.fieldId);
      if (!field) {
        throw new BadRequestException(`Unknown field "${filter.fieldId}"`);
      }
      if (!visibleFieldIds.includes(filter.fieldId)) {
        throw new BadRequestException(
          `Field "${filter.fieldId}" is not filterable for this viewer`,
        );
      }
      if (!field.filterable) {
        throw new BadRequestException(
          `Field "${filter.fieldId}" is not filterable`,
        );
      }
      const allowed = allowedOperatorsForField(field);
      if (!allowed.includes(filter.operator)) {
        throw new BadRequestException(
          `Operator "${filter.operator}" is not supported for field "${filter.fieldId}"`,
        );
      }
      if (filter.operator === 'between') {
        this.validateBetweenFilter(filter);
      }
      if (filter.operator === 'is_empty') {
        this.validateIsEmptyFilter(filter);
      }
    }
  }

  private validateBetweenFilter(filter: FieldFilter): void {
    const { value } = filter;
    if (!Array.isArray(value) || value.length !== 2) {
      throw new BadRequestException(
        'between filter requires exactly two ISO dates',
      );
    }
    const [from, to] = value;
    if (!this.isWellFormedIsoDate(from) || !this.isWellFormedIsoDate(to)) {
      throw new BadRequestException(
        'between filter requires well-formed ISO dates',
      );
    }
    if (from > to) {
      throw new BadRequestException('between filter requires from <= to');
    }
  }

  private validateIsEmptyFilter(filter: FieldFilter): void {
    if (filter.value !== null && filter.value !== undefined) {
      throw new BadRequestException('is_empty filter must not include a value');
    }
  }

  private isWellFormedIsoDate(value: unknown): boolean {
    return (
      typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
    );
  }

  private async loadEmployeeSnapshots(): Promise<EmployeeSnapshot[]> {
    const employees = await this.prisma.employee.findMany({
      select: {
        id: true,
        openToMentoring: true,
        user: { select: { name: true } },
        gradeHistory: {
          select: { value: true, effectiveFrom: true, effectiveTo: true },
        },
        positionHistory: {
          select: { value: true, effectiveFrom: true, effectiveTo: true },
        },
        departmentHistory: {
          select: { value: true, effectiveFrom: true, effectiveTo: true },
        },
        employmentTypeHistory: {
          select: { value: true, effectiveFrom: true, effectiveTo: true },
        },
      },
      orderBy: { id: 'asc' },
    });

    const activeMentorPairs = await this.prisma.mentorshipPair.findMany({
      where: { endedAt: null },
      select: { mentorId: true },
      distinct: ['mentorId'],
    });
    const activeMentorIds = new Set(
      activeMentorPairs.map((pair) => pair.mentorId),
    );

    return employees.map((employee) => {
      const gradeHistory = employee.gradeHistory as HistoryRowSnapshot[];
      const positionHistory = employee.positionHistory as HistoryRowSnapshot[];
      const departmentHistory =
        employee.departmentHistory as HistoryRowSnapshot[];
      const employmentTypeHistory =
        employee.employmentTypeHistory as HistoryRowSnapshot[];

      const grade = currentHistoryValue(gradeHistory);
      const position = currentHistoryValue(positionHistory);
      const department = currentHistoryValue(departmentHistory);
      const employmentType = currentHistoryValue(employmentTypeHistory);

      const tenureDates = [
        ...gradeHistory.map((row) => row.effectiveFrom),
        ...positionHistory.map((row) => row.effectiveFrom),
        ...departmentHistory.map((row) => row.effectiveFrom),
        ...employmentTypeHistory.map((row) => row.effectiveFrom),
      ];

      return {
        employeeId: employee.id,
        name: employee.user?.name ?? null,
        grade: grade?.value ?? null,
        position: position?.value ?? null,
        department: department?.value ?? null,
        employmentType: employmentType?.value ?? null,
        tenureStart: earliestDate(tenureDates),
        openToMentoring: employee.openToMentoring,
        hasActiveMentorPair: activeMentorIds.has(employee.id),
      };
    });
  }

  private rethrowKnownErrors(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException('Custom field name already exists');
      }
      if (error.code === 'P2025') {
        throw new NotFoundException('Record not found');
      }
    }
    throw error;
  }
}
