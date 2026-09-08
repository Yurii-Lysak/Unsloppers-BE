import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RiskLevel } from '../../../generated/prisma/client';
import type { RiskTrend } from '../risk-input';

export class RiskDashboardCountsEntity {
  @ApiProperty()
  need_attention!: number;

  @ApiProperty()
  medium!: number;

  @ApiProperty()
  high!: number;

  @ApiProperty()
  leaver!: number;

  @ApiProperty({
    description: 'Count of employees at any active level above low',
  })
  totalActive!: number;
}

export class RiskDashboardRowEntity {
  @ApiProperty()
  employeeId!: string;

  @ApiProperty()
  displayName!: string;

  @ApiProperty({ enum: RiskLevel })
  currentLevel!: RiskLevel;

  @ApiPropertyOptional({ enum: ['up', 'down', 'flat'] })
  trend?: RiskTrend;

  @ApiProperty({ format: 'date' })
  recordedAt!: string;

  @ApiPropertyOptional()
  department?: string;

  @ApiPropertyOptional()
  managerName?: string;

  @ApiPropertyOptional()
  peoplePartnerName?: string;
}

export class RiskDashboardEntity {
  @ApiProperty({ type: RiskDashboardCountsEntity })
  counts!: RiskDashboardCountsEntity;

  @ApiProperty({ type: [RiskDashboardRowEntity] })
  rows!: RiskDashboardRowEntity[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;
}

export class RiskDashboardAccessEntity {
  @ApiProperty()
  canAccess!: boolean;
}

export class RiskDashboardSummaryEntity {
  @ApiProperty({ type: RiskDashboardCountsEntity })
  counts!: RiskDashboardCountsEntity;
}
