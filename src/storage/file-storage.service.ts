import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';

export type StoredFileProfile = {
  kind: 'photo' | 'certificate';
  maxBytes: number;
  allowedMimeTypes: ReadonlySet<string>;
  allowedExtensions: ReadonlySet<string>;
};

const PHOTO_PROFILE: StoredFileProfile = {
  kind: 'photo',
  maxBytes: 5 * 1024 * 1024,
  allowedMimeTypes: new Set(['image/jpeg', 'image/png', 'image/webp']),
  allowedExtensions: new Set(['.jpg', '.jpeg', '.png', '.webp']),
};

const CERTIFICATE_PROFILE: StoredFileProfile = {
  kind: 'certificate',
  maxBytes: 10 * 1024 * 1024,
  allowedMimeTypes: new Set(['application/pdf', 'image/jpeg', 'image/png']),
  allowedExtensions: new Set(['.pdf', '.jpg', '.jpeg', '.png']),
};

const MAX_ORIGINAL_FILENAME_LENGTH = 255;

@Injectable()
export class FileStorageService implements OnModuleInit {
  private readonly logger = new Logger(FileStorageService.name);
  private uploadsDir!: string;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.uploadsDir = path.resolve(
      this.config.get<string>('UPLOADS_DIR', './uploads'),
    );
    await mkdir(this.uploadsDir, { recursive: true });
  }

  getPhotoProfile(): StoredFileProfile {
    return PHOTO_PROFILE;
  }

  getCertificateProfile(): StoredFileProfile {
    return CERTIFICATE_PROFILE;
  }

  sanitizeOriginalFilename(originalname: string): string {
    const basename = path.basename(originalname).trim();
    if (!basename) {
      throw new BadRequestException('Original filename is required');
    }
    if (basename.length > MAX_ORIGINAL_FILENAME_LENGTH) {
      throw new BadRequestException(
        `Original filename must be at most ${MAX_ORIGINAL_FILENAME_LENGTH} characters`,
      );
    }
    return basename;
  }

  sanitizeContentDispositionFilename(originalFilename: string): string {
    return originalFilename.replace(/[\r\n"]/g, '_');
  }

  inferMimeTypeFromStorageKey(storageKey: string): string {
    const extension = path.extname(storageKey).toLowerCase();
    switch (extension) {
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.webp':
        return 'image/webp';
      case '.pdf':
        return 'application/pdf';
      default:
        return 'application/octet-stream';
    }
  }

  async save(
    file: Express.Multer.File,
    profile: StoredFileProfile,
  ): Promise<{ storageKey: string; mimeType: string; sizeBytes: number }> {
    if (!file?.buffer) {
      throw new BadRequestException('File is required');
    }

    if (file.buffer.length !== file.size) {
      throw new BadRequestException(
        'File size does not match uploaded content',
      );
    }

    this.assertWithinSize(file.size, profile);
    this.assertAllowedMimeType(file.mimetype, profile);
    this.assertAllowedExtension(file.originalname, profile);
    this.assertMagicBytes(file.buffer, profile);

    const extension = this.resolveExtension(file.originalname, file.mimetype);
    const storageKey = `${randomUUID()}${extension}`;
    const absolutePath = this.resolveAbsolutePath(storageKey);

    await fs.writeFile(absolutePath, file.buffer);

    return {
      storageKey,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    };
  }

  async delete(storageKey: string): Promise<void> {
    try {
      await fs.unlink(this.resolveAbsolutePath(storageKey));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        this.logger.warn(`Missing upload file for key ${storageKey}`);
        return;
      }
      this.logger.warn(
        `Failed to delete upload file for key ${storageKey}: ${String(error)}`,
      );
    }
  }

  createReadStream(storageKey: string): Readable {
    return createReadStream(this.resolveAbsolutePath(storageKey));
  }

  async fileExists(storageKey: string): Promise<boolean> {
    try {
      await fs.access(this.resolveAbsolutePath(storageKey));
      return true;
    } catch {
      return false;
    }
  }

  private resolveAbsolutePath(storageKey: string): string {
    const normalizedKey = path.basename(storageKey);
    const absolutePath = path.resolve(this.uploadsDir, normalizedKey);
    if (!absolutePath.startsWith(this.uploadsDir + path.sep)) {
      throw new BadRequestException('Invalid storage key');
    }
    return absolutePath;
  }

  private assertWithinSize(size: number, profile: StoredFileProfile): void {
    if (size <= 0 || size > profile.maxBytes) {
      throw new BadRequestException(
        `File exceeds the ${profile.kind} size limit`,
      );
    }
  }

  private assertAllowedMimeType(
    mimeType: string,
    profile: StoredFileProfile,
  ): void {
    const normalized = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
    if (!profile.allowedMimeTypes.has(normalized)) {
      throw new BadRequestException('File type is not allowed');
    }
  }

  private assertAllowedExtension(
    originalname: string,
    profile: StoredFileProfile,
  ): void {
    const extension = path.extname(originalname).toLowerCase();
    if (!profile.allowedExtensions.has(extension)) {
      throw new BadRequestException('File extension is not allowed');
    }
  }

  private assertMagicBytes(buffer: Buffer, profile: StoredFileProfile): void {
    if (profile.kind === 'photo') {
      if (this.isJpeg(buffer) || this.isPng(buffer) || this.isWebp(buffer)) {
        return;
      }
      throw new BadRequestException(
        'File content does not match an allowed image type',
      );
    }

    if (this.isPdf(buffer) || this.isJpeg(buffer) || this.isPng(buffer)) {
      return;
    }
    throw new BadRequestException(
      'File content does not match an allowed document type',
    );
  }

  private resolveExtension(originalname: string, mimeType: string): string {
    const fromName = path.extname(originalname).toLowerCase();
    if (fromName && PHOTO_PROFILE.allowedExtensions.has(fromName)) {
      return fromName === '.jpeg' ? '.jpg' : fromName;
    }

    switch (mimeType) {
      case 'image/jpeg':
        return '.jpg';
      case 'image/png':
        return '.png';
      case 'image/webp':
        return '.webp';
      case 'application/pdf':
        return '.pdf';
      default:
        throw new BadRequestException('File type is not allowed');
    }
  }

  private isJpeg(buffer: Buffer): boolean {
    return (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    );
  }

  private isPng(buffer: Buffer): boolean {
    const signature = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    return (
      buffer.length >= signature.length &&
      buffer.subarray(0, signature.length).equals(signature)
    );
  }

  private isWebp(buffer: Buffer): boolean {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }

  private isPdf(buffer: Buffer): boolean {
    return (
      buffer.length >= 4 && buffer.subarray(0, 4).toString('ascii') === '%PDF'
    );
  }
}
