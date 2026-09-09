import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RequestHistoryEntryEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  requestId!: string;

  @ApiProperty({ enum: ['proposed', 'approved', 'rejected'] })
  status!: 'proposed' | 'approved' | 'rejected';

  @ApiPropertyOptional({
    maxLength: 2000,
    description: 'Present only when status is rejected',
  })
  decisionReason?: string | null;

  @ApiProperty({ format: 'date-time' })
  proposedAt!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  decidedAt?: string | null;

  @ApiProperty()
  vacancyDetails!: string;

  @ApiProperty()
  department!: string;

  @ApiPropertyOptional({ enum: ['open', 'pending_dm_review'] })
  requestStatus?: 'open' | 'pending_dm_review';

  @ApiPropertyOptional({
    description: 'Project label — uses projectId until a directory exists',
  })
  projectName?: string | null;
}

export class RequestHistorySectionEntity {
  @ApiProperty({ type: [RequestHistoryEntryEntity] })
  entries!: RequestHistoryEntryEntity[];
}
