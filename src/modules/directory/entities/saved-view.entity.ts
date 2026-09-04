import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmployeeFieldFilterDto } from '../dto/list-employees-query.dto';
import type { SortOrder } from '../../contracts/field-registry.contract';

export class SavedViewShareRecipientEntity {
  @ApiProperty({ format: 'uuid' })
  employeeId!: string;

  @ApiProperty()
  name!: string;
}

export class SavedViewEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: EmployeeFieldFilterDto, isArray: true })
  filters!: EmployeeFieldFilterDto[];

  @ApiProperty({ type: [String] })
  columnIds!: string[];

  @ApiPropertyOptional()
  sort?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  order?: SortOrder;

  @ApiProperty()
  isOwner!: boolean;

  @ApiProperty()
  canEdit!: boolean;

  @ApiPropertyOptional({ format: 'uuid' })
  ownerEmployeeId?: string | null;

  @ApiPropertyOptional()
  ownerName?: string | null;

  @ApiProperty({ type: SavedViewShareRecipientEntity, isArray: true })
  sharedWith!: SavedViewShareRecipientEntity[];
}
