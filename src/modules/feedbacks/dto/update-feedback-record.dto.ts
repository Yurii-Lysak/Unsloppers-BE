import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  FEEDBACK_MAX_BODY_LENGTH,
  FEEDBACK_MAX_CONTEXT_LENGTH,
} from '../feedbacks.constants';
import { IsFeedbackCalendarDate } from './is-feedback-calendar-date.validator';

export class UpdateFeedbackRecordDto {
  @ApiPropertyOptional({ format: 'date', example: '2026-09-01' })
  @ValidateIf((dto: UpdateFeedbackRecordDto) => dto.recordedAt !== undefined)
  @IsString()
  @IsFeedbackCalendarDate()
  recordedAt?: string;

  @ApiPropertyOptional({ maxLength: FEEDBACK_MAX_CONTEXT_LENGTH })
  @ValidateIf((dto: UpdateFeedbackRecordDto) => dto.context !== undefined)
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNotEmpty()
  @MaxLength(FEEDBACK_MAX_CONTEXT_LENGTH)
  context?: string;

  @ApiPropertyOptional({ maxLength: FEEDBACK_MAX_BODY_LENGTH })
  @ValidateIf((dto: UpdateFeedbackRecordDto) => dto.body !== undefined)
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNotEmpty()
  @MaxLength(FEEDBACK_MAX_BODY_LENGTH)
  body?: string;

  @ApiPropertyOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === null ? undefined : value,
  )
  @ValidateIf((dto: UpdateFeedbackRecordDto) => dto.sharedWithEmployee != null)
  @IsBoolean()
  sharedWithEmployee?: boolean;
}
