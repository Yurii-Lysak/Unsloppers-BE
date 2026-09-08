import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ResourcingProposalEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  requestId!: string;

  @ApiProperty()
  proposedById!: string;

  @ApiPropertyOptional({
    description: 'Internal candidate — null for external proposals',
  })
  candidateEmployeeId?: string | null;

  @ApiPropertyOptional({
    description: 'Display name, only present for internal candidates',
  })
  candidateDisplayName?: string;

  @ApiPropertyOptional({ maxLength: 128 })
  peopleForceCandidateId?: string | null;

  @ApiPropertyOptional({ maxLength: 2000 })
  peopleForceCandidateUrl?: string | null;

  @ApiProperty({ enum: ['proposed'] })
  status!: 'proposed';

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}
