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

  // Story 3.4 — set when the requested filters referenced a field that
  // exists in the catalog but is outside this viewer's visibility (e.g. a
  // shared saved view filtering on a management-only custom field). The
  // entire filter set is dropped rather than 400ing, so the viewer still
  // sees their own entitled slice of the list.
  @ApiPropertyOptional()
  filtersHidden?: boolean;
}
