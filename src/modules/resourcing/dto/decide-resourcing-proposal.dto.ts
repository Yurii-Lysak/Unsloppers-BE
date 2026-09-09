import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const trimStringValue = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * `decision` is validated against exactly `'approved'`/`'rejected'` (400 on
 * anything else — `INVALID_DECISION_VALUE` matrix row). `reason` is required
 * only when rejecting a `proposed` row or reversing an `approved` row to
 * `rejected` — enforced in `ResourcingService`, not here (data-dependent on
 * the proposal's current status, not a pure DTO rule).
 */
export class DecideResourcingProposalDto {
  @ApiProperty({ enum: ['approved', 'rejected'] })
  @IsIn(['approved', 'rejected'])
  decision!: 'approved' | 'rejected';

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @Transform(trimStringValue)
  @MaxLength(2000)
  reason?: string;
}
