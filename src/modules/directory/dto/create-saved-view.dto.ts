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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { SortOrder } from '../../contracts/field-registry.contract';
import { EmployeeFieldFilterDto } from './list-employees-query.dto';

export class CreateSavedViewDto {
  @ApiProperty({ minLength: 1, maxLength: 120 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ type: EmployeeFieldFilterDto, isArray: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmployeeFieldFilterDto)
  filters!: EmployeeFieldFilterDto[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  columnIds!: string[];

  @ApiPropertyOptional({ description: 'Field id to sort by' })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: SortOrder;
}
