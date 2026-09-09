import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RiskLevel } from '../../../generated/prisma/client';
import type { DashboardVariant } from './dashboard-config.entity';

export class DashboardCounterValueEntity {
  @ApiProperty({ enum: ['available', 'unavailable'] })
  status!: 'available' | 'unavailable';

  @ApiPropertyOptional()
  value?: number;
}

export class DashboardTableRiskCellEntity {
  @ApiProperty({ enum: RiskLevel })
  level!: RiskLevel;

  @ApiPropertyOptional({ enum: ['up', 'down', 'flat'] })
  trend?: 'up' | 'down' | 'flat';

  @ApiProperty({ format: 'date' })
  recordedAt!: string;
}

export class DashboardTableRowEntity {
  @ApiProperty()
  employeeId!: string;

  @ApiProperty()
  displayName!: string;

  @ApiPropertyOptional({ type: DashboardTableRiskCellEntity })
  risk?: DashboardTableRiskCellEntity;

  @ApiProperty({ enum: ['available', 'unavailable'] })
  leaveStatus!: 'available' | 'unavailable';

  @ApiPropertyOptional()
  leaveLabel?: string;

  @ApiProperty({ enum: ['available', 'unavailable'] })
  projectStatus!: 'available' | 'unavailable';

  @ApiPropertyOptional()
  projectLabel?: string;

  @ApiPropertyOptional()
  leaveStale?: boolean;

  @ApiPropertyOptional()
  projectStale?: boolean;
}

export class DashboardProjectGroupEntity {
  @ApiProperty()
  projectId!: string;

  @ApiProperty()
  projectName!: string;

  @ApiProperty({ type: [DashboardTableRowEntity] })
  rows!: DashboardTableRowEntity[];
}

export class DashboardPaginationEntity {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;

  @ApiProperty()
  totalRows!: number;
}

export class DashboardSummaryEntity {
  @ApiProperty({ enum: ['um', 'dm', 'pm', 'pp'] })
  variant!: DashboardVariant;

  @ApiProperty({ enum: ['people', 'project'] })
  grouping!: 'people' | 'project';

  @ApiProperty({ type: 'object', additionalProperties: { type: 'object' } })
  counters!: Record<string, DashboardCounterValueEntity>;

  @ApiPropertyOptional({ type: [DashboardTableRowEntity] })
  rows?: DashboardTableRowEntity[];

  @ApiPropertyOptional({ type: [DashboardProjectGroupEntity] })
  groups?: DashboardProjectGroupEntity[];

  @ApiPropertyOptional({ type: DashboardPaginationEntity })
  pagination?: DashboardPaginationEntity;
}
