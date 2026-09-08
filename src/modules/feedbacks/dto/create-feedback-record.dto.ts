import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  FEEDBACK_MAX_BODY_LENGTH,
  FEEDBACK_MAX_CONTEXT_LENGTH,
} from '../feedbacks.constants';
import { IsFeedbackCalendarDate } from './is-feedback-calendar-date.validator';

export class CreateFeedbackRecordDto {
  @ApiProperty({ format: 'date', example: '2026-09-01' })
  @IsString()
  @IsFeedbackCalendarDate()
  recordedAt!: string;

  @ApiProperty({ maxLength: FEEDBACK_MAX_CONTEXT_LENGTH })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNotEmpty()
  @MaxLength(FEEDBACK_MAX_CONTEXT_LENGTH)
  context!: string;

  @ApiProperty({ maxLength: FEEDBACK_MAX_BODY_LENGTH })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNotEmpty()
  @MaxLength(FEEDBACK_MAX_BODY_LENGTH)
  body!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  sharedWithEmployee?: boolean;
}
