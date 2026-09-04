import { ApiProperty } from '@nestjs/swagger';
import type { FieldValue } from '../../contracts/field-registry.contract';

export class EmployeeFieldUpdateEntity {
  @ApiProperty()
  employeeId!: string;

  @ApiProperty()
  fieldId!: string;

  @ApiProperty({
    oneOf: [
      { type: 'string' },
      { type: 'number' },
      { type: 'boolean' },
      { type: 'array', items: { type: 'string' } },
      { type: 'null' },
    ],
    nullable: true,
  })
  value!: FieldValue;
}
