import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

const trimStringValue = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Exactly one of `candidateEmployeeId` (internal) or `peopleForceCandidateUrl`
 * (external, required) must be present — enforced in `ResourcingService`
 * (data-dependent guard: internal requires the candidate to belong to the
 * proposer's managed department tree, not expressible as a pure DTO rule).
 */
export class CreateResourcingProposalDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  candidateEmployeeId?: string;

  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  @Transform(trimStringValue)
  @MaxLength(128)
  peopleForceCandidateId?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @Transform(trimStringValue)
  @MaxLength(2000)
  peopleForceCandidateUrl?: string;
}
