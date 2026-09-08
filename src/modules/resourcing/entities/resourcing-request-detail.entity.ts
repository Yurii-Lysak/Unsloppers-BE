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
 * fulfilment-only data. `candidatePool` and `reviewingDmId` are populated
 * only for the routed UM (the only viewer who can reach these routes in
 * 6.2 — see `assertCanFulfilResourcing` + the NOT_ROUTED guard).
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
}
