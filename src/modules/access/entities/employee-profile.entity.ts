import { ApiProperty } from '@nestjs/swagger';

export class ProfileAudienceEntity {
  @ApiProperty({
    enum: [
      'Self',
      'ReportingLine',
      'ProjectLine',
      'PP',
      'Colleague',
      'SharedLink',
      'FullAccess',
    ],
  })
  role!:
    | 'Self'
    | 'ReportingLine'
    | 'ProjectLine'
    | 'PP'
    | 'Colleague'
    | 'SharedLink'
    | 'FullAccess';

  @ApiProperty({
    description: 'Full section grant map for the resolved viewer/subject pair.',
    example: { S1: 'R', S2: 'none' },
  })
  sections!: Record<string, 'R' | 'RW' | 'none'>;
}

export class ProfileSectionUnavailableEntity {
  @ApiProperty({ enum: ['R', 'RW'] })
  accessLevel!: 'R' | 'RW';

  @ApiProperty({ enum: ['unavailable'] })
  status!: 'unavailable';
}

export class ProfileSectionDataEntity {
  @ApiProperty({ enum: ['R', 'RW'] })
  accessLevel!: 'R' | 'RW';

  @ApiProperty({ description: 'Section-specific payload shape.' })
  data!: Record<string, unknown>;
}

export class EmployeeProfileEntity {
  @ApiProperty({ format: 'uuid' })
  employeeId!: string;

  @ApiProperty({ example: 'Anton Savchenko' })
  displayName!: string;

  @ApiProperty({ type: ProfileAudienceEntity })
  audience!: ProfileAudienceEntity;

  @ApiProperty({
    description:
      'Only granted sections appear. Each value is either data or unavailable.',
  })
  sections!: Record<
    string,
    ProfileSectionUnavailableEntity | ProfileSectionDataEntity
  >;
}

export type AssembledProfileSection =
  ProfileSectionUnavailableEntity | ProfileSectionDataEntity;
