import { ApiProperty } from '@nestjs/swagger';

import { MENTOR_STATUS_VALUES } from './mentorship-section.entity';

export class AssignableMenteeEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Jane Mentee' })
  displayName!: string;
}

export class AssignableMenteesListEntity {
  @ApiProperty({ type: [AssignableMenteeEntity] })
  mentees!: AssignableMenteeEntity[];
}

export class ActiveMentorshipPairEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  mentorId!: string;

  @ApiProperty({ example: 'Jane Mentor' })
  mentorDisplayName!: string;

  @ApiProperty({ format: 'uuid' })
  menteeId!: string;

  @ApiProperty({ example: 'Alex Mentee' })
  menteeDisplayName!: string;

  @ApiProperty({ format: 'date-time' })
  startedAt!: string;

  @ApiProperty({ format: 'date-time', nullable: true })
  endedAt!: string | null;

  @ApiProperty({ enum: ['active', 'ended'] })
  status!: 'active' | 'ended';
}

export class ActiveMentorshipPairsListEntity {
  @ApiProperty({ type: [ActiveMentorshipPairEntity] })
  pairs!: ActiveMentorshipPairEntity[];
}

export class CreatedMentorshipPairEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  mentorId!: string;

  @ApiProperty({ format: 'uuid' })
  menteeId!: string;

  @ApiProperty({ format: 'date-time' })
  startedAt!: string;

  @ApiProperty({ enum: MENTOR_STATUS_VALUES })
  mentorStatus!: (typeof MENTOR_STATUS_VALUES)[number];
}

export class EndedMentorshipPairEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  mentorId!: string;

  @ApiProperty({ format: 'uuid' })
  menteeId!: string;

  @ApiProperty({ format: 'date-time' })
  startedAt!: string;

  @ApiProperty({ format: 'date-time' })
  endedAt!: string;

  @ApiProperty()
  closureFeedback!: string;

  @ApiProperty({ enum: MENTOR_STATUS_VALUES })
  mentorStatus!: (typeof MENTOR_STATUS_VALUES)[number];
}
