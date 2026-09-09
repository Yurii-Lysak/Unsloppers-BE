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

  @ApiProperty({ enum: ['proposed', 'approved', 'rejected'] })
  status!: 'proposed' | 'approved' | 'rejected';

  @ApiPropertyOptional({
    maxLength: 2000,
    description:
      'Set when rejected (from proposed) or reversed (from approved); null otherwise',
  })
  decisionReason?: string | null;

  @ApiPropertyOptional({
    description:
      "Story 6.3 — the internal candidate's existing shared-link token " +
      '(created at 6.2 submit), populated only when the viewer is the ' +
      'reviewing DM; null when no live link exists or the candidate is ' +
      'external.',
  })
  sharedLinkToken?: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}
