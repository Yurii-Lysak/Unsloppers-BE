import { ApiProperty } from '@nestjs/swagger';

export class CustomFieldValueEntity {
  @ApiProperty({ format: 'uuid' })
  employeeId!: string;

  @ApiProperty({ format: 'uuid' })
  fieldId!: string;

  @ApiProperty({
    nullable: true,
    oneOf: [
      { type: 'string' },
      { type: 'number' },
      { type: 'boolean' },
      { type: 'array', items: { type: 'string' } },
    ],
  })
  value!: string | number | boolean | string[] | null;
}
