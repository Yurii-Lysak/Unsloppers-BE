import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RiskLevel } from '../../../generated/prisma/client';

export class RiskRecordAuthorEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  displayName!: string;
}

export class RiskRecordReadEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: RiskLevel })
  level!: RiskLevel;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  details!: string;

  @ApiProperty({ format: 'date' })
  recordedAt!: string;

  @ApiProperty({ type: RiskRecordAuthorEntity })
  author!: RiskRecordAuthorEntity;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class RisksSectionEntity {
  @ApiProperty({ type: [RiskRecordReadEntity] })
  records!: RiskRecordReadEntity[];

  @ApiPropertyOptional({ enum: RiskLevel })
  currentLevel?: RiskLevel;
}
