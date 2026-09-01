import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateManagementNoteDto {
  @ApiProperty({ maxLength: 10_000 })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNotEmpty()
  @MaxLength(10_000)
  content!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  visibleForEmployee?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  visibleForPm?: boolean;
}
