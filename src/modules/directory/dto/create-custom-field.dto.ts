import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';
import type {
  FieldValueType,
  FieldVisibility,
} from '../../contracts/field-registry.contract';

const FIELD_TYPES = [
  'text',
  'number',
  'date',
  'boolean',
  'select',
  'multi_select',
] as const satisfies readonly FieldValueType[];

const FIELD_VISIBILITIES = [
  'management',
  'employee',
  'colleague',
] as const satisfies readonly FieldVisibility[];

export class CreateCustomFieldDto {
  @ApiProperty({ example: 'Preferred office' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ enum: FIELD_TYPES })
  @IsEnum(FIELD_TYPES)
  type!: FieldValueType;

  @ApiPropertyOptional({
    enum: FIELD_VISIBILITIES,
    default: 'management',
  })
  @IsOptional()
  @IsEnum(FIELD_VISIBILITIES)
  visibility?: FieldVisibility;

  @ApiPropertyOptional({
    type: [String],
    description: 'Required for select and multi_select types',
  })
  @ValidateIf(
    (dto: CreateCustomFieldDto) =>
      dto.type === 'select' || dto.type === 'multi_select',
  )
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  options?: string[];
}
