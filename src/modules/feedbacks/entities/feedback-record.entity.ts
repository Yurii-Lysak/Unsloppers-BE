import { ApiProperty } from '@nestjs/swagger';

export class FeedbackRecordAuthorEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  displayName!: string;
}

export class FeedbackRecordReadEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty({ format: 'date' })
  recordedAt!: string;

  @ApiProperty()
  context!: string;

  @ApiProperty()
  body!: string;

  @ApiProperty({ type: FeedbackRecordAuthorEntity })
  author!: FeedbackRecordAuthorEntity;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class FeedbackRecordEntity extends FeedbackRecordReadEntity {
  @ApiProperty()
  sharedWithEmployee!: boolean;
}

export class FeedbackSectionEntity {
  @ApiProperty({ type: [FeedbackRecordEntity] })
  records!: FeedbackRecordReadEntity[] | FeedbackRecordEntity[];
}
