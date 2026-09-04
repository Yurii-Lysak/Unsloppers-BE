import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';
import type { RiskLevel } from '../../../generated/prisma/client';
import { RISK_LEVELS } from '../risk-input';
import { IsRiskCalendarDate } from './is-risk-calendar-date.validator';

export class CreateRiskRecordDto {
  @ApiProperty({ enum: RISK_LEVELS })
  @IsIn(RISK_LEVELS)
  level!: RiskLevel;

  @ApiProperty({ maxLength: 500 })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNotEmpty()
  @MaxLength(500)
  description!: string;

  @ApiProperty({ maxLength: 5000 })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNotEmpty()
  @MaxLength(5000)
  details!: string;

  @ApiProperty({ format: 'date', example: '2026-09-01' })
  @IsString()
  @IsRiskCalendarDate()
  recordedAt!: string;
}
