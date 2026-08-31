import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomFieldDefinition,
  CustomFieldType,
  Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  FieldDefinitionDto,
  FieldQueryOptions,
  FieldQueryResultDto,
  FieldRegistry,
  FieldValue,
  FieldValueType,
  FieldVisibility,
} from '../contracts/field-registry.contract';

const SELECT_TYPES: CustomFieldType[] = ['select', 'multi_select'];

@Injectable()
export class FieldRegistryService extends FieldRegistry {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async defineField(
    name: string,
    type: FieldValueType,
    visibility: FieldVisibility,
    options: string[] = [],
  ): Promise<string> {
    this.assertSelectOptions(type, options);

    try {
      const created = await this.prisma.customFieldDefinition.create({
        data: {
          name: name.trim(),
          type: type,
          visibility: visibility,
          options: SELECT_TYPES.includes(type) ? options : Prisma.JsonNull,
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

  async query(options: FieldQueryOptions): Promise<FieldQueryResultDto[]> {
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

  private assertSelectOptions(type: FieldValueType, options: string[]): void {
    if (!SELECT_TYPES.includes(type)) {
      return;
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
        if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
          throw new BadRequestException('Expected an ISO date string');
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
      case 'date':
        return {
          ...empty,
          valueDate: new Date(value as string),
        };
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
        return row.valueDate === null
          ? null
          : row.valueDate.toISOString().slice(0, 10);
      case 'boolean':
        return row.valueBoolean;
      case 'select':
        return row.valueSelect;
      case 'multi_select':
        if (row.valueText === null) {
          return null;
        }
        return JSON.parse(row.valueText) as string[];
      default: {
        const _exhaustive: never = type;
        void _exhaustive;
        throw new BadRequestException('Unsupported field type');
      }
    }
  }

  private async assertEmployeeExists(employeeId: string): Promise<void> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true },
    });
    if (!employee) {
      throw new NotFoundException(`Employee "${employeeId}" not found`);
    }
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
