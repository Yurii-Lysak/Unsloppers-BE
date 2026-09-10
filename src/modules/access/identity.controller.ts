import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  StreamableFile,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { MulterExceptionFilter } from '../../common/filters/multer-exception.filter';
import { CurrentUserProvider } from '../contracts/current-user-provider.contract';
import { SectionAccessGate } from '../contracts/section-access-gate.contract';
import { PrismaService } from '../../prisma/prisma.service';
import { FileStorageService } from '../storage/file-storage.service';
import { IdentityService } from './identity.service';

const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

@ApiTags('identity')
@UseFilters(MulterExceptionFilter)
@Controller('employees/:employeeId/identity')
export class IdentityController {
  constructor(
    private readonly identity: IdentityService,
    private readonly currentUser: CurrentUserProvider,
    private readonly prisma: PrismaService,
    private readonly sectionGate: SectionAccessGate,
    private readonly fileStorage: FileStorageService,
  ) {}

  @Post('photo')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('photo', {
      limits: { fileSize: PHOTO_MAX_BYTES },
    }),
  )
  async uploadPhoto(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<{ photoUrl: string }> {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    await this.assertSubjectEmployeeExists(employeeId);
    this.assertSelfOnly(viewerEmployeeId, employeeId);
    await this.sectionGate.requireSection(
      viewerEmployeeId,
      employeeId,
      'S1',
      'R',
    );

    if (!file) {
      throw new BadRequestException('Photo file is required');
    }

    return this.identity.uploadPhoto(employeeId, file);
  }

  @Get('photo')
  async getPhoto(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ): Promise<StreamableFile> {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    await this.assertSubjectEmployeeExists(employeeId);
    await this.sectionGate.requireSection(
      viewerEmployeeId,
      employeeId,
      'S1',
      'R',
    );

    const storageKey = await this.identity.getPhotoStorageKey(employeeId);
    if (!storageKey) {
      throw new NotFoundException('Photo not found');
    }

    if (!(await this.fileStorage.fileExists(storageKey))) {
      throw new NotFoundException('Photo not found');
    }

    return new StreamableFile(this.fileStorage.createReadStream(storageKey), {
      type: this.fileStorage.inferMimeTypeFromStorageKey(storageKey),
      disposition: 'inline',
    });
  }

  private assertSelfOnly(viewerEmployeeId: string, employeeId: string): void {
    if (viewerEmployeeId !== employeeId) {
      throw new ForbiddenException(
        'Only the profile owner may upload a profile photo',
      );
    }
  }

  private async assertSubjectEmployeeExists(employeeId: string): Promise<void> {
    const subject = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true },
    });
    if (!subject) {
      throw new NotFoundException(`Employee ${employeeId} not found`);
    }
  }

  private async resolveViewerEmployeeId(request: Request): Promise<string> {
    const { userId } = await this.currentUser.getCurrentUser(request);
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!employee) {
      throw new ForbiddenException('Authenticated user has no employee record');
    }
    return employee.id;
  }
}
