import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type DashboardBlockId =
  'counters' | 'table' | 'ownActionItems' | 'quickNav' | 'resourcingRequests';

export type DashboardGrouping = 'people' | 'project';

export type DashboardVariant = 'um' | 'dm' | 'pm' | 'pp';

export class DashboardCounterSpecEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  providerId!: string;

  @ApiProperty()
  labelKey!: string;
}

export class DashboardQuickNavLinkEntity {
  @ApiProperty()
  labelKey!: string;

  @ApiProperty()
  path!: string;
}

export class DashboardSelectorProjectEntity {
  @ApiProperty()
  projectId!: string;

  @ApiProperty()
  projectName!: string;
}

export class DashboardConfigEntity {
  @ApiProperty({ enum: ['um', 'dm', 'pm', 'pp'] })
  variant!: DashboardVariant;

  @ApiProperty({ enum: ['people', 'project'] })
  grouping!: DashboardGrouping;

  @ApiProperty({
    type: [String],
    enum: [
      'counters',
      'table',
      'ownActionItems',
      'quickNav',
      'resourcingRequests',
    ],
  })
  blocks!: DashboardBlockId[];

  @ApiProperty({ type: [DashboardCounterSpecEntity] })
  counters!: DashboardCounterSpecEntity[];

  @ApiProperty({ type: [DashboardQuickNavLinkEntity] })
  quickNav!: DashboardQuickNavLinkEntity[];

  @ApiProperty({ enum: ['seed-map', 'functional-role'] })
  resolvedBy!: 'seed-map' | 'functional-role';

  @ApiPropertyOptional({ type: [DashboardSelectorProjectEntity] })
  selectorProjects?: DashboardSelectorProjectEntity[];
}
