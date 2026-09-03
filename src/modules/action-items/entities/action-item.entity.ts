import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ActionItemPersonEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  displayName!: string;
}

export class ActionItemReadEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({ format: 'date' })
  dueDate!: string;

  @ApiPropertyOptional()
  link?: string;

  @ApiProperty({ enum: ['open', 'completed', 'cancelled'] })
  status!: 'open' | 'completed' | 'cancelled';

  @ApiProperty({ enum: ['manual', 'campaign'] })
  source!: 'manual' | 'campaign';

  @ApiProperty({ type: ActionItemPersonEntity })
  author!: ActionItemPersonEntity;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class AuthoredActionItemReadEntity extends ActionItemReadEntity {
  @ApiProperty({ type: ActionItemPersonEntity })
  assignee!: ActionItemPersonEntity;
}

export class ActionItemsSectionEntity {
  @ApiProperty({ type: [ActionItemReadEntity] })
  items!: ActionItemReadEntity[];
}
