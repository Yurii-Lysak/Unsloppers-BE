import { ApiProperty } from '@nestjs/swagger';
import type { FieldDefinitionDto } from '../../contracts/field-registry.contract';

export class CustomFieldDefinitionEntity implements FieldDefinitionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({
    enum: ['text', 'number', 'date', 'boolean', 'select', 'multi_select'],
  })
  type!: FieldDefinitionDto['type'];

  @ApiProperty({ enum: ['management', 'employee', 'colleague'] })
  visibility!: FieldDefinitionDto['visibility'];

  @ApiProperty({ type: [String] })
  options!: string[];
}
