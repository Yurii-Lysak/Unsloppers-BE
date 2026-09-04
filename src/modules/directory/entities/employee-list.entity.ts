import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FieldValue } from '../../contracts/field-registry.contract';
import { FieldSpecEntity } from './field-spec.entity';

export class EmployeeRowEntity {
  @ApiProperty()
  employeeId!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: {
      oneOf: [
        { type: 'string' },
        { type: 'number' },
        { type: 'boolean' },
        { type: 'array', items: { type: 'string' } },
        { type: 'null' },
      ],
    },
  })
  cells!: Record<string, FieldValue>;

  @ApiPropertyOptional({ type: String, isArray: true })
  writableFieldIds?: string[];
}

export class EmployeeListEntity {
  @ApiProperty({ type: FieldSpecEntity, isArray: true })
  fields!: FieldSpecEntity[];

  @ApiProperty({ type: EmployeeRowEntity, isArray: true })
  rows!: EmployeeRowEntity[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;
}
