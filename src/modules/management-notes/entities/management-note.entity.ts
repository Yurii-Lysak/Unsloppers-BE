import { ApiProperty } from '@nestjs/swagger';

export class ManagementNoteAuthorEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  displayName!: string;
}

export class ManagementNoteReadEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  content!: string;

  @ApiProperty({ type: ManagementNoteAuthorEntity })
  author!: ManagementNoteAuthorEntity;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class ManagementNoteEntity extends ManagementNoteReadEntity {
  @ApiProperty()
  visibleForEmployee!: boolean;

  @ApiProperty()
  visibleForPm!: boolean;
}

export class ManagementNotesSectionEntity {
  @ApiProperty({ type: [ManagementNoteReadEntity] })
  notes!: ManagementNoteReadEntity[] | ManagementNoteEntity[];

  @ApiProperty({ required: false })
  hasHiddenNotes?: boolean;
}
