import { ApiProperty } from '@nestjs/swagger';
import type {
  FieldValue,
  FieldValueType,
} from '../../contracts/field-registry.contract';

export class CustomFieldsSectionFieldEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({
    enum: ['text', 'number', 'date', 'boolean', 'select', 'multi_select'],
  })
  type!: FieldValueType;
}

export class CustomFieldsSectionEntity {
  @ApiProperty({
    type: [CustomFieldsSectionFieldEntity],
    description:
      'Only fields that pass per-field visibility for this viewer/subject pair.',
  })
  fields!: CustomFieldsSectionFieldEntity[];

  @ApiProperty({
    description:
      'Stored values keyed by field id (AD-6 lazy-unset semantics) — a field with no stored row is omitted, never emitted as null.',
    example: { 'field-id': 'value' },
  })
  values!: Record<string, FieldValue>;
}
