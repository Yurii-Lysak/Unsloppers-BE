import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CdsAssessmentEntryEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty({ format: 'date' })
  date!: string;

  @ApiProperty()
  assessor!: string;

  @ApiProperty()
  resultLink!: string;

  @ApiProperty()
  conclusion!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class CdsIdpRecordEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ format: 'date' })
  deadline!: string;

  @ApiProperty()
  fileUrl!: string;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  completedAt!: string | null;
}

export class CdsSectionEntity {
  @ApiPropertyOptional({ nullable: true })
  matrixLink!: string | null;

  @ApiProperty({ type: [CdsAssessmentEntryEntity] })
  assessments!: CdsAssessmentEntryEntity[];

  @ApiProperty({ type: [CdsIdpRecordEntity] })
  idpRecords!: CdsIdpRecordEntity[];
}
