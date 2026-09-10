import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PersonalContactMethodType } from '../../../generated/prisma/client';
import { IsPersonalContactValue } from './is-personal-contact-value.validator';

export class CreateContactMethodDto {
  @ApiProperty({ enum: PersonalContactMethodType })
  @IsEnum(PersonalContactMethodType)
  type!: PersonalContactMethodType;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNotEmpty()
  @MaxLength(200)
  label!: string;

  @ApiProperty({ maxLength: 500 })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf((dto: CreateContactMethodDto) => dto.value !== undefined)
  @IsNotEmpty()
  @IsPersonalContactValue()
  @MaxLength(500)
  value!: string;
}
