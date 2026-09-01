import { Type, Transform } from 'class-transformer';
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
    try {
      return JSON.parse(value) as unknown;
    } catch {
      throw new BadRequestException('Invalid filters JSON');
    }
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmployeeFieldFilterDto)
  filters?: EmployeeFieldFilterDto[];
}
