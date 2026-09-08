import { BadRequestException } from '@nestjs/common';
import { CreateResourcingProposalDto } from './dto/create-resourcing-proposal.dto';

export interface NormalizedInternalProposalInput {
  kind: 'internal';
  candidateEmployeeId: string;
}

export interface NormalizedExternalProposalInput {
  kind: 'external';
  peopleForceCandidateUrl: string;
  peopleForceCandidateId: string | null;
}

export type NormalizedProposalInput =
  NormalizedInternalProposalInput | NormalizedExternalProposalInput;

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * I/O matrix `INTERNAL_OUT_OF_UNIT`/`EXTERNAL_NO_URL` — the "exactly one of
 * internal/external" shape rule, independent of the unit-membership guard
 * (which needs a DB round-trip and lives in `ResourcingService`).
 */
export function normalizeCreateResourcingProposalInput(
  dto: CreateResourcingProposalDto,
): NormalizedProposalInput {
  const hasInternal = Boolean(dto.candidateEmployeeId);
  const hasExternalUrl = Boolean(dto.peopleForceCandidateUrl);

  if (hasInternal && hasExternalUrl) {
    throw new BadRequestException(
      'Provide either an internal candidateEmployeeId or an external peopleForceCandidateUrl, not both',
    );
  }

  if (hasInternal) {
    return {
      kind: 'internal',
      candidateEmployeeId: dto.candidateEmployeeId!,
    };
  }

  if (hasExternalUrl) {
    const url = dto.peopleForceCandidateUrl!;
    if (!isValidHttpUrl(url)) {
      throw new BadRequestException(
        'peopleForceCandidateUrl must be a valid http or https URL',
      );
    }
    return {
      kind: 'external',
      peopleForceCandidateUrl: url,
      peopleForceCandidateId: dto.peopleForceCandidateId ?? null,
    };
  }

  throw new BadRequestException(
    'Provide either an internal candidateEmployeeId or an external peopleForceCandidateUrl',
  );
}
