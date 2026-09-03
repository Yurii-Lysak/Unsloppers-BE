import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { IsCalendarDate } from './is-calendar-date.validator';

export class CreateActionItemDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ format: 'date', example: '2026-09-15' })
  @IsString()
  @IsCalendarDate()
  dueDate!: string;

  @ApiPropertyOptional({ maxLength: 2048 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string' && value.trim() === '') {
      return undefined;
    }
    return value;
  })
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  link?: string;
}
