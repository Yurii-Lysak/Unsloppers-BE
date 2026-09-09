import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, IsUrl, MaxLength } from 'class-validator';
import { IsIdpCalendarDate } from './is-idp-calendar-date.validator';

export class CreateCdsAssessmentDto {
  @ApiProperty({ format: 'date', example: '2026-06-15' })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsIdpCalendarDate({
    message: 'date must be a valid ISO calendar date (YYYY-MM-DD)',
  })
  date!: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNotEmpty()
  @MaxLength(200)
  assessor!: string;

  @ApiProperty({ maxLength: 2048 })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNotEmpty()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(2048)
  resultLink!: string;

  @ApiProperty({ maxLength: 10_000 })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNotEmpty()
  @MaxLength(10_000)
  conclusion!: string;
}
