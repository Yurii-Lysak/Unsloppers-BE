import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, IsUrl, MaxLength } from 'class-validator';
import { IsCampaignCalendarDate } from './is-campaign-calendar-date.validator';

const trimStringValue = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateCampaignDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @Transform(trimStringValue)
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ maxLength: 500, description: 'Short description' })
  @IsString()
  @Transform(trimStringValue)
  @IsNotEmpty()
  @MaxLength(500)
  description!: string;

  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @Transform(trimStringValue)
  @IsNotEmpty()
  @MaxLength(2000)
  purpose!: string;

  @ApiProperty({ maxLength: 2048, description: 'Link to the external form' })
  @IsString()
  @Transform(trimStringValue)
  @IsNotEmpty()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(2048)
  link!: string;

  @ApiProperty({ format: 'date', example: '2026-09-15' })
  @IsString()
  @IsCampaignCalendarDate()
  dueDate!: string;
}
