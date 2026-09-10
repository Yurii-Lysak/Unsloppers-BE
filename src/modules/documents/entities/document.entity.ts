import { ApiProperty } from '@nestjs/swagger';
import { DocumentType } from '../../../generated/prisma/client';

export class DocumentRecordEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: DocumentType })
  type!: DocumentType;

  @ApiProperty({ example: 'certificate.pdf' })
  originalFilename!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  uploadedAt!: Date;

  @ApiProperty({
    example: '/api/v1/employees/{employeeId}/documents/{documentId}/file',
  })
  downloadUrl!: string;
}

export class DocumentsSectionEntity {
  @ApiProperty({ type: [DocumentRecordEntity] })
  documents!: DocumentRecordEntity[];
}
