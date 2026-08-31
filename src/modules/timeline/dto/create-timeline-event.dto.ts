import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { TIMELINE_EVENT_TYPES } from '../timeline.constants';

export class CreateTimelineEventDto {
  @ApiProperty({ enum: TIMELINE_EVENT_TYPES })
  @IsEnum(TIMELINE_EVENT_TYPES)
  type!: (typeof TIMELINE_EVENT_TYPES)[number];

  @ApiProperty({ example: '2019-03-15', format: 'date' })
  @IsDateString()
  effectiveDate!: string;

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
  @IsOptional()
  oldValue?: unknown;

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
  @IsOptional()
  newValue?: unknown;
}
