import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { DocumentType } from '../../../generated/prisma/client';

export class CreateDocumentDto {
  @ApiProperty({ enum: DocumentType, example: DocumentType.CERTIFICATE })
  @IsEnum(DocumentType)
  type!: DocumentType;
}
