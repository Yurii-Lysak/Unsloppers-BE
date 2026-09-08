import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trimStringValue = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateResourcingRequestDto {
  @ApiProperty({ maxLength: 5000 })
  @IsString()
  @Transform(trimStringValue)
  @IsNotEmpty()
  @MaxLength(5000)
  vacancyDetails!: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @Transform(trimStringValue)
  @IsNotEmpty()
  @MaxLength(200)
  expectedCompBand!: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @Transform(trimStringValue)
  @IsNotEmpty()
  @MaxLength(200)
  duration!: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @Transform(trimStringValue)
  @IsNotEmpty()
  @MaxLength(200)
  workload!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 99, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  headcount?: number;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @Transform(trimStringValue)
  @IsNotEmpty()
  @MaxLength(200)
  department!: string;

  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  @Transform(trimStringValue)
  @MaxLength(128)
  projectId?: string | null;
}
