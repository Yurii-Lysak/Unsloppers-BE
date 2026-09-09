import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, IsUrl, MaxLength } from 'class-validator';
import { IsIdpCalendarDate } from './is-idp-calendar-date.validator';

export class CreateIdpRecordDto {
  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNotEmpty()
  @MaxLength(2000)
  description!: string;

  @ApiProperty({ format: 'date', example: '2026-12-01' })
  @IsString()
  @IsIdpCalendarDate()
  deadline!: string;

  @ApiProperty({ maxLength: 2048 })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNotEmpty()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(2048)
  fileUrl!: string;
}
