import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import type { SectionId } from '../../contracts/access-resolver.contract';

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
