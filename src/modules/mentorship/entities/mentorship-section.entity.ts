import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MENTOR_STATUS_VALUES,
  type MentorStatus,
} from '../contracts/mentor-status.contract';

export { MENTOR_STATUS_VALUES, type MentorStatus };

export class MentorshipRelationEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Jane Mentor' })
  displayName!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  pairId?: string;
}

export const MENTORSHIP_PAIR_HISTORY_ROLES = ['mentor', 'mentee'] as const;

export type MentorshipPairHistoryRole =
  (typeof MENTORSHIP_PAIR_HISTORY_ROLES)[number];

export class MentorshipPairHistoryEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: MENTORSHIP_PAIR_HISTORY_ROLES })
  role!: MentorshipPairHistoryRole;

  @ApiProperty({ type: MentorshipRelationEntity })
  counterpart!: MentorshipRelationEntity;

  @ApiProperty({ format: 'date-time' })
  startedAt!: string;

  @ApiProperty({ format: 'date-time' })
  endedAt!: string;

  @ApiPropertyOptional({ nullable: true })
  closureFeedback?: string | null;
}

export class MentorshipSectionEntity {
  @ApiProperty()
  openToMentoring!: boolean;

  @ApiProperty({ enum: MENTOR_STATUS_VALUES })
  mentorStatus!: MentorStatus;

  @ApiPropertyOptional({ type: MentorshipRelationEntity, nullable: true })
  mentor?: MentorshipRelationEntity | null;

  @ApiProperty({ type: [MentorshipRelationEntity] })
  mentees!: MentorshipRelationEntity[];

  @ApiProperty({ type: [MentorshipPairHistoryEntity] })
  pairHistory!: MentorshipPairHistoryEntity[];
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
