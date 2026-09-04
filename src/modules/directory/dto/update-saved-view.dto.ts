import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { SortOrder } from '../../contracts/field-registry.contract';
import { EmployeeFieldFilterDto } from './list-employees-query.dto';

export class UpdateSavedViewDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 120 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ type: EmployeeFieldFilterDto, isArray: true })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmployeeFieldFilterDto)
  filters?: EmployeeFieldFilterDto[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  columnIds?: string[];

  @ApiPropertyOptional({ description: 'Field id to sort by' })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: SortOrder;
}
