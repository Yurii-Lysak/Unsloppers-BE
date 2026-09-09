import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ResourcingRequestReadEntity } from './resourcing-request.entity';
import { ResourcingProposalEntity } from './resourcing-proposal.entity';

export class ResourcingCandidatePoolEntryEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  displayName!: string;
}

/**
 * `GET /:id` and `POST /:id/submit` response — the 6.1 read shape plus
 * fulfilment/review data. Story 6.3 widened `GET /:id` to the reviewing DM
 * too; `candidatePool` stays UM-only (omitted when the viewer is the
 * reviewing DM), while `reviewingDmId`, `approvedCount`, and
 * `viewerIsReviewingDm` are always present on the detail read.
 */
export class ResourcingRequestDetailEntity extends ResourcingRequestReadEntity {
  @ApiProperty({ type: [ResourcingProposalEntity] })
  proposals!: ResourcingProposalEntity[];

  @ApiPropertyOptional({
    description:
      'Resolved once at submit — the DM who will review this request. Null until submitted.',
  })
  reviewingDmId?: string | null;

  @ApiPropertyOptional({
    type: [ResourcingCandidatePoolEntryEntity],
    description:
      "Employees in the viewer's managed department tree, eligible as an internal candidate.",
  })
  candidatePool?: ResourcingCandidatePoolEntryEntity[];

  @ApiProperty({
    description: "Live count of this request's currently `approved` proposals.",
  })
  approvedCount!: number;

  @ApiProperty({
    description:
      'Server-computed viewerEmployeeId === request.reviewingDmId — the ' +
      'frontend has no other way to know its own viewerEmployeeId to ' +
      'perform that comparison itself.',
  })
  viewerIsReviewingDm!: boolean;
}
