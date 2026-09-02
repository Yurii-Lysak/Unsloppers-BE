import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import type { SectionId } from '../../contracts/access-resolver.contract';

@ValidatorConstraint({ name: 'isStrictInteger', async: false })
class IsStrictIntegerConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === undefined || value === null) {
      return true;
    }
    return typeof value === 'number' && Number.isInteger(value);
  }

  defaultMessage(): string {
    return 'expiresInHours must be an integer';
  }
}

function IsStrictInteger(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsStrictIntegerConstraint,
    });
  };
}

const SECTION_IDS: SectionId[] = [
  'S1',
  'S2',
  'S3',
  'S4',
  'S5',
  'S6',
  'S7',
  'S8',
  'S9',
  'S10',
  'S11',
  'S12',
  'S13',
  'S14',
  'S15',
  'S16',
];

export class CreateSharedLinkDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  recipientEmployeeId!: string;

  @ApiPropertyOptional({
    description:
      'Explicit cfg section enables. S1 is always included by default when omitted.',
    isArray: true,
    example: ['S9'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(SECTION_IDS, { each: true })
  sections?: SectionId[];

  @ApiPropertyOptional({
    description:
      'Link lifetime in hours. Default 24 when omitted. Min 1, max 168.',
    example: 24,
    minimum: 1,
    maximum: 168,
  })
  @IsOptional()
  @IsStrictInteger()
  @Min(1)
  @Max(168)
  expiresInHours?: number;
}

export class CreateSharedLinkResponseDto {
  @ApiProperty()
  token!: string;

  @ApiProperty({
    description: 'SPA-relative path to open the shared link view',
    example: '/shared-links/abc123',
  })
  url!: string;
}

export class SharedLinkPersonDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  displayName!: string;
}

export class SharedLinkSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: SharedLinkPersonDto })
  recipient!: SharedLinkPersonDto;

  @ApiProperty({ type: SharedLinkPersonDto })
  creator!: SharedLinkPersonDto;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ isArray: true, example: ['S1', 'S9'] })
  sectionIds!: SectionId[];
}

export class ListSharedLinksResponseDto {
  @ApiProperty({ type: [SharedLinkSummaryDto] })
  links!: SharedLinkSummaryDto[];
}

export class RevokeSharedLinkResponseDto {
  @ApiProperty()
  revoked!: boolean;
}

export class SharedLinkAccessLogEntryDto {
  @ApiProperty({ format: 'date-time' })
  accessedAt!: string;

  @ApiProperty({ enum: ['granted', 'denied'] })
  outcome!: 'granted' | 'denied';

  @ApiPropertyOptional({
    enum: ['expired', 'revoked', 'wrong_recipient'],
  })
  denialReason?: 'expired' | 'revoked' | 'wrong_recipient';

  @ApiProperty({ nullable: true })
  originIp!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  recipientEmployeeId!: string | null;
}

export class SharedLinkAccessLogResponseDto {
  @ApiProperty({ type: [SharedLinkAccessLogEntryDto] })
  entries!: SharedLinkAccessLogEntryDto[];
}
