import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ResourcingRequestAuthorEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  displayName!: string;
}

export class ResourcingRequestReadEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  vacancyDetails!: string;

  @ApiPropertyOptional({
    description:
      'Omitted unless the viewer is the author or the DM on the request project',
  })
  expectedCompBand?: string;

  @ApiProperty()
  duration!: string;

  @ApiProperty()
  workload!: string;

  @ApiProperty()
  headcount!: number;

  @ApiProperty()
  department!: string;

  @ApiPropertyOptional()
  projectId?: string | null;

  @ApiProperty({ enum: ['open'] })
  status!: 'open';

  @ApiProperty({ type: ResourcingRequestAuthorEntity })
  author!: ResourcingRequestAuthorEntity;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}
