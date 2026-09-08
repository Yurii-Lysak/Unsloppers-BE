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
