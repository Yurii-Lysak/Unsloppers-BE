import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DocumentType } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { FileStorageService } from '../../storage/file-storage.service';
import { DocumentsService } from '../documents.service';

describe('DocumentsService', () => {
  let service: DocumentsService;

  const prisma = {
    document: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  const fileStorage = {
    sanitizeOriginalFilename: jest.fn((name: string) => name),
    save: jest.fn(),
    getCertificateProfile: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: FileStorageService, useValue: fileStorage },
      ],
    }).compile();

    service = module.get(DocumentsService);
  });

  it('rejects non-certificate uploads', async () => {
    await expect(
      service.createCertificate(
        'employee-id',
        {
          originalname: 'cv.pdf',
          mimetype: 'application/pdf',
          size: 10,
          buffer: Buffer.from('%PDF'),
        } as Express.Multer.File,
        DocumentType.CV,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates a certificate row', async () => {
    fileStorage.getCertificateProfile.mockReturnValue({});
    fileStorage.save.mockResolvedValue({
      storageKey: 'file-key.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 12,
    });
    prisma.document.create.mockResolvedValue({
      id: 'doc-id',
      type: DocumentType.CERTIFICATE,
      originalFilename: 'certificate.pdf',
      uploadedAt: new Date('2026-09-10T00:00:00.000Z'),
    });

    await expect(
      service.createCertificate(
        'employee-id',
        {
          originalname: 'certificate.pdf',
          mimetype: 'application/pdf',
          size: 12,
          buffer: Buffer.from('%PDF'),
        } as Express.Multer.File,
        DocumentType.CERTIFICATE,
      ),
    ).resolves.toEqual({
      id: 'doc-id',
      type: DocumentType.CERTIFICATE,
      originalFilename: 'certificate.pdf',
      uploadedAt: new Date('2026-09-10T00:00:00.000Z'),
      downloadUrl: '/api/v1/employees/employee-id/documents/doc-id/file',
    });
  });

  it('returns 404 when a document does not belong to the employee', async () => {
    prisma.document.findFirst.mockResolvedValue(null);

    await expect(
      service.findDocumentForEmployee('employee-id', 'missing-id'),
    ).rejects.toThrow(NotFoundException);
  });
});
