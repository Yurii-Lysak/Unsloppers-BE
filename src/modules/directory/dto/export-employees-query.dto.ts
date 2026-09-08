import { Type, Transform, plainToInstance } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { SortOrder } from '../../contracts/field-registry.contract';
import { EmployeeFieldFilterDto } from './list-employees-query.dto';

export class ExportEmployeesQueryDto {
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
    return plainToInstance(EmployeeFieldFilterDto, parsed);
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmployeeFieldFilterDto)
  filters?: EmployeeFieldFilterDto[];

  @ApiProperty({
    type: String,
    isArray: true,
    description: 'JSON-encoded array of field ids to export as columns',
  })
  @Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === null) {
      throw new BadRequestException('columns is required');
    }
    if (typeof value !== 'string') {
      throw new BadRequestException('columns must be a JSON-encoded string');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new BadRequestException('Invalid columns JSON');
    }
    if (!Array.isArray(parsed)) {
      throw new BadRequestException('columns must be a JSON-encoded array');
    }
    if (!parsed.every((entry) => typeof entry === 'string')) {
      throw new BadRequestException(
        'columns must contain only field id strings',
      );
    }
    return parsed;
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  columns!: string[];
}
