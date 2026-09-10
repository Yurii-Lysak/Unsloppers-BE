import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FileStorageService } from '../../storage/file-storage.service';

@Injectable()
export class IdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fileStorage: FileStorageService,
  ) {}

  buildPhotoUrl(
    employeeId: string,
    photoStorageKey: string | null,
  ): string | null {
    if (!photoStorageKey) {
      return null;
    }
    return `/api/v1/employees/${employeeId}/identity/photo`;
  }

  async uploadPhoto(
    employeeId: string,
    file: Express.Multer.File,
  ): Promise<{ photoUrl: string }> {
    const stored = await this.fileStorage.save(
      file,
      this.fileStorage.getPhotoProfile(),
    );

    const previous = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { photoStorageKey: true },
    });

    try {
      await this.prisma.employee.update({
        where: { id: employeeId },
        data: { photoStorageKey: stored.storageKey },
      });
    } catch (error) {
      await this.fileStorage.delete(stored.storageKey);
      throw error;
    }

    if (previous?.photoStorageKey) {
      await this.fileStorage.delete(previous.photoStorageKey);
    }

    return {
      photoUrl: this.buildPhotoUrl(employeeId, stored.storageKey)!,
    };
  }

  async getPhotoStorageKey(employeeId: string): Promise<string | null> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { photoStorageKey: true },
    });
    return employee?.photoStorageKey ?? null;
  }
}
