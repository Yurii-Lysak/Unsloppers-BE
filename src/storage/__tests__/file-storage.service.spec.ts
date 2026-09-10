import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FileStorageService } from '../file-storage.service';

const minimalJpeg = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
  0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0xff,
  0xd9,
]);

const minimalPdf = Buffer.from('%PDF-1.0\n%%EOF');

describe('FileStorageService', () => {
  let service: FileStorageService;
  let uploadsDir: string;

  beforeEach(async () => {
    uploadsDir = await mkdtemp(path.join(tmpdir(), 'uploads-'));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileStorageService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) =>
              key === 'UPLOADS_DIR' ? uploadsDir : defaultValue,
            ),
          },
        },
      ],
    }).compile();

    service = module.get(FileStorageService);
    await service.onModuleInit();
  });

  afterEach(async () => {
    await rm(uploadsDir, { recursive: true, force: true });
  });

  it('saves a valid photo and deletes it', async () => {
    const saved = await service.save(
      {
        originalname: 'avatar.jpg',
        mimetype: 'image/jpeg',
        size: minimalJpeg.length,
        buffer: minimalJpeg,
      } as Express.Multer.File,
      service.getPhotoProfile(),
    );

    expect(saved.storageKey.endsWith('.jpg')).toBe(true);
    const bytes = await readFile(path.join(uploadsDir, saved.storageKey));
    expect(bytes.equals(minimalJpeg)).toBe(true);

    await service.delete(saved.storageKey);
    expect(await service.fileExists(saved.storageKey)).toBe(false);
  });

  it('rejects spoofed photo MIME types', async () => {
    await expect(
      service.save(
        {
          originalname: 'avatar.jpg',
          mimetype: 'image/jpeg',
          size: minimalPdf.length,
          buffer: minimalPdf,
        } as Express.Multer.File,
        service.getPhotoProfile(),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('saves a valid certificate PDF', async () => {
    const saved = await service.save(
      {
        originalname: 'certificate.pdf',
        mimetype: 'application/pdf',
        size: minimalPdf.length,
        buffer: minimalPdf,
      } as Express.Multer.File,
      service.getCertificateProfile(),
    );

    expect(saved.storageKey.endsWith('.pdf')).toBe(true);
  });

  it('rejects filenames longer than 255 characters', () => {
    expect(() =>
      service.sanitizeOriginalFilename(`${'a'.repeat(256)}.pdf`),
    ).toThrow(BadRequestException);
  });

  it('sanitizes content-disposition filenames', () => {
    expect(service.sanitizeContentDispositionFilename('cert"bad\r\n.pdf')).toBe(
      'cert_bad__.pdf',
    );
  });

  it('infers mime types from storage keys', () => {
    expect(service.inferMimeTypeFromStorageKey('photo.jpg')).toBe('image/jpeg');
    expect(service.inferMimeTypeFromStorageKey('doc.pdf')).toBe(
      'application/pdf',
    );
  });
});
