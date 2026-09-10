import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProjectNameEntryEntity {
  @ApiProperty({
    description:
      'Project display label. Bootcamp stub uses projectId until a Project directory exists.',
    example: 'People Management Platform',
  })
  name!: string;

  @ApiPropertyOptional({
    description: 'Project manager display name. Omitted for Colleague viewers.',
    nullable: true,
    type: String,
  })
  pm?: string | null;

  @ApiPropertyOptional({
    description:
      'Delivery manager display name. Omitted for Colleague viewers.',
    nullable: true,
    type: String,
  })
  dm?: string | null;

  @ApiPropertyOptional({
    description: 'Assignment start date (ISO). Omitted for Colleague viewers.',
    format: 'date',
    example: '2026-01-01',
  })
  startDate?: string;

  @ApiPropertyOptional({
    description:
      'Assignment end date (ISO), or null when ongoing. Omitted for Colleague viewers.',
    format: 'date',
    nullable: true,
    type: String,
  })
  endDate?: string | null;
}

export class ProjectsSectionDto {
  @ApiProperty({ type: [ProjectNameEntryEntity] })
  projects!: ProjectNameEntryEntity[];
}
