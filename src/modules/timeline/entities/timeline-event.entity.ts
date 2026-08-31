import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Prisma, TimelineEvent } from '../../../generated/prisma/client';
import { TIMELINE_EVENT_TYPES } from '../timeline.constants';

export class TimelineEventEntity implements TimelineEvent {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  employeeId!: string;

  @ApiProperty({ enum: TIMELINE_EVENT_TYPES })
  type!: string;

  @ApiProperty({ type: String, format: 'date' })
  effectiveDate!: Date;

  @ApiPropertyOptional({
    nullable: true,
    oneOf: [
      { type: 'string' },
      { type: 'number' },
      { type: 'boolean' },
      { type: 'object' },
      { type: 'array' },
    ],
  })
  oldValue!: Prisma.JsonValue;

  @ApiPropertyOptional({
    nullable: true,
    oneOf: [
      { type: 'string' },
      { type: 'number' },
      { type: 'boolean' },
      { type: 'object' },
      { type: 'array' },
    ],
  })
  newValue!: Prisma.JsonValue;

  @ApiProperty({ enum: ['system', 'manual'] })
  source!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  authorId!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  systemWriteSkippedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  deletedAt!: Date | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  deletedById!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  updatedById!: string | null;
}
