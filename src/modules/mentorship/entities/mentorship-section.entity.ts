import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MentorshipRelationEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Jane Mentor' })
  displayName!: string;
}

export const MENTOR_STATUS_VALUES = [
  'mentor',
  'openToMentoring',
  'none',
] as const;

export type MentorStatus = (typeof MENTOR_STATUS_VALUES)[number];

export class MentorshipSectionEntity {
  @ApiProperty()
  openToMentoring!: boolean;

  @ApiProperty({ enum: MENTOR_STATUS_VALUES })
  mentorStatus!: MentorStatus;

  @ApiPropertyOptional({ type: MentorshipRelationEntity, nullable: true })
  mentor?: MentorshipRelationEntity | null;

  @ApiProperty({ type: [MentorshipRelationEntity] })
  mentees!: MentorshipRelationEntity[];
}

export class WillingMentorEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Jane Mentor' })
  displayName!: string;

  @ApiProperty({ example: true })
  openToMentoring!: true;
}

export class WillingMentorsListEntity {
  @ApiProperty({ type: [WillingMentorEntity] })
  mentors!: WillingMentorEntity[];
}
