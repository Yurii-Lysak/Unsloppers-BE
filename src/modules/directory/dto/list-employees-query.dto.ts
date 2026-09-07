import { Type, Transform, plainToInstance } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsValuePresent } from './update-employee-field.dto';
import type {
  FieldValue,
  FilterOperator,
  SortOrder,
} from '../../contracts/field-registry.contract';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MIN_PAGE } from '../field-catalog';

const FILTER_OPERATORS: FilterOperator[] = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'in',
];

export class EmployeeFieldFilterDto {
  @ApiProperty()
  @IsString()
  fieldId!: string;

  @ApiProperty({ enum: FILTER_OPERATORS })
  @IsIn(FILTER_OPERATORS)
  operator!: FilterOperator;

  @ApiProperty({
    oneOf: [
      { type: 'string' },
      { type: 'number' },
      { type: 'boolean' },
      { type: 'array', items: { type: 'string' } },
      { type: 'null' },
    ],
  })
  // No type-specific validator fits every field type's value shape (string,
  // number, boolean, string[], or null), but the property still needs at
  // least one class-validator decorator — otherwise the global
  // ValidationPipe's `whitelist: true` strips it as "unknown" before
  // `validateFilters` ever runs. Same fix already applied to
  // `UpdateEmployeeFieldDto.value` for the same reason.
  @IsValuePresent()
  value!: FieldValue | string[];
}

export class ListEmployeesQueryDto {
  @ApiPropertyOptional({ minimum: MIN_PAGE, default: MIN_PAGE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_PAGE)
  page?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
    default: DEFAULT_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number;

  @ApiPropertyOptional({ description: 'Field id to sort by' })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: SortOrder;

  @ApiPropertyOptional({
    type: EmployeeFieldFilterDto,
    isArray: true,
    description: 'JSON-encoded array of field filters',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === null) {
      return undefined;
    }
    if (typeof value !== 'string') {
      throw new BadRequestException('filters must be a JSON-encoded string');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new BadRequestException('Invalid filters JSON');
    }
    if (!Array.isArray(parsed)) {
      throw new BadRequestException('filters must be a JSON-encoded array');
    }
    // `@Type` only instantiates nested class instances when class-transformer
    // walks a plain object on its own; a custom `@Transform` on this same
    // property replaces that walk, so the parsed array items stay plain
    // objects. With the global ValidationPipe's `whitelist: true`, plain
    // objects have no class metadata, so every property (fieldId, operator,
    // value) gets silently stripped before `@ValidateNested` even runs.
    // Instantiating explicitly here restores the class metadata whitelist
    // needs.
    return plainToInstance(EmployeeFieldFilterDto, parsed);
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmployeeFieldFilterDto)
  filters?: EmployeeFieldFilterDto[];
}
