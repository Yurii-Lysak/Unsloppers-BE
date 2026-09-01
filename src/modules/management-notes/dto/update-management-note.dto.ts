import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateManagementNoteDto {
  @ApiPropertyOptional({ maxLength: 10_000 })
  @ValidateIf((dto: UpdateManagementNoteDto) => dto.content !== undefined)
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNotEmpty()
  @MaxLength(10_000)
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  visibleForEmployee?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  visibleForPm?: boolean;
}
