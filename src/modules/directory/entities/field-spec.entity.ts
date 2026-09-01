import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { FieldSpec } from '../../contracts/field-registry.contract';

export class FieldSpecEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  type!: FieldSpec['type'];

  @ApiProperty()
  source!: FieldSpec['source'];

  @ApiProperty()
  sortable!: boolean;

  @ApiProperty()
  filterable!: boolean;

  @ApiPropertyOptional()
  visibility?: FieldSpec['visibility'];

  @ApiPropertyOptional({ type: String, isArray: true })
  options?: string[];
}
