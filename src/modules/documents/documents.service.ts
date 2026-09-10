import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentType } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FileStorageService } from '../../storage/file-storage.service';
import { DocumentRecordEntity } from './entities/document.entity';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fileStorage: FileStorageService,
  ) {}

  buildDownloadUrl(employeeId: string, documentId: string): string {
    return `/api/v1/employees/${employeeId}/documents/${documentId}/file`;
  }

  toRecordEntity(
    employeeId: string,
    document: {
      id: string;
      type: DocumentType;
      originalFilename: string;
      uploadedAt: Date;
    },
  ): DocumentRecordEntity {
    return {
      id: document.id,
      type: document.type,
      originalFilename: document.originalFilename,
      uploadedAt: document.uploadedAt,
      downloadUrl: this.buildDownloadUrl(employeeId, document.id),
    };
  }

  async buildDocumentsSection(
    employeeId: string,
    allowedTypes?: ReadonlySet<DocumentType>,
  ): Promise<{ documents: DocumentRecordEntity[] }> {
    const rows = await this.prisma.document.findMany({
      where: {
        employeeId,
        ...(allowedTypes ? { type: { in: [...allowedTypes] } } : {}),
      },
      orderBy: { uploadedAt: 'desc' },
      select: {
        id: true,
        type: true,
        originalFilename: true,
        uploadedAt: true,
      },
    });

    return {
      documents: rows.map((row) => this.toRecordEntity(employeeId, row)),
    };
  }

  async createCertificate(
    employeeId: string,
    file: Express.Multer.File,
    type: DocumentType,
  ): Promise<DocumentRecordEntity> {
    if (type !== DocumentType.CERTIFICATE) {
      throw new BadRequestException('Only certificate uploads are supported');
    }

    const originalFilename = this.fileStorage.sanitizeOriginalFilename(
      file.originalname,
    );
    const stored = await this.fileStorage.save(
      file,
      this.fileStorage.getCertificateProfile(),
    );

    try {
      const created = await this.prisma.document.create({
        data: {
          employeeId,
          type,
          originalFilename,
          storageKey: stored.storageKey,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
        },
        select: {
          id: true,
          type: true,
          originalFilename: true,
          uploadedAt: true,
        },
      });

      return this.toRecordEntity(employeeId, created);
    } catch (error) {
      await this.fileStorage.delete(stored.storageKey);
      throw error;
    }
  }

  async findDocumentForEmployee(
    employeeId: string,
    documentId: string,
  ): Promise<{
    id: string;
    type: DocumentType;
    storageKey: string;
    mimeType: string;
    originalFilename: string;
  }> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, employeeId },
      select: {
        id: true,
        type: true,
        storageKey: true,
        mimeType: true,
        originalFilename: true,
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    return document;
  }
}
