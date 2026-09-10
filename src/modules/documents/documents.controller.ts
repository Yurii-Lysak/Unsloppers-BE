import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  StreamableFile,
  UploadedFile,
  UseFilters,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { MulterExceptionFilter } from '../../common/filters/multer-exception.filter';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AccessResolver,
  AccessRole,
} from '../contracts/access-resolver.contract';
import { CurrentUserProvider } from '../contracts/current-user-provider.contract';
import { SectionAccessGate } from '../contracts/section-access-gate.contract';
import { FileStorageService } from '../storage/file-storage.service';
import { PROJECT_LINE_VISIBLE_DOCUMENT_TYPES } from './documents.constants';
import { CreateDocumentDto } from './dto/create-document.dto';
import { DocumentRecordEntity } from './entities/document.entity';
import { DocumentsService } from './documents.service';
import { DocumentType } from '../../generated/prisma/client';

const CERTIFICATE_MAX_BYTES = 10 * 1024 * 1024;

const writeValidationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

@ApiTags('documents')
@UseFilters(MulterExceptionFilter)
@Controller('employees/:employeeId/documents')
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly currentUser: CurrentUserProvider,
    private readonly prisma: PrismaService,
    private readonly sectionGate: SectionAccessGate,
    private readonly accessResolver: AccessResolver,
    private readonly fileStorage: FileStorageService,
  ) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: CERTIFICATE_MAX_BYTES },
    }),
  )
  @UsePipes(writeValidationPipe)
  async create(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: CreateDocumentDto,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<DocumentRecordEntity> {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    await this.assertSubjectEmployeeExists(employeeId);
    this.assertSelfOnly(viewerEmployeeId, employeeId);
    await this.sectionGate.requireSection(
      viewerEmployeeId,
      employeeId,
      'S5',
      'R',
    );

    if (!file) {
      throw new BadRequestException('Document file is required');
    }

    return this.documents.createCertificate(employeeId, file, dto.type);
  }

  @Get(':documentId/file')
  async downloadFile(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ): Promise<StreamableFile> {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    await this.assertSubjectEmployeeExists(employeeId);
    await this.sectionGate.requireSection(
      viewerEmployeeId,
      employeeId,
      'S5',
      'R',
    );

    const document = await this.documents.findDocumentForEmployee(
      employeeId,
      documentId,
    );

    const audience = await this.accessResolver.resolveAudience(
      viewerEmployeeId,
      employeeId,
    );
    if (this.isProjectLineRestrictedType(audience.role, document.type)) {
      throw new NotFoundException('Document not found');
    }

    if (!(await this.fileStorage.fileExists(document.storageKey))) {
      throw new NotFoundException('Document not found');
    }

    return new StreamableFile(
      this.fileStorage.createReadStream(document.storageKey),
      {
        type: document.mimeType,
        disposition: `inline; filename="${this.fileStorage.sanitizeContentDispositionFilename(document.originalFilename)}"`,
      },
    );
  }

  private isProjectLineRestrictedType(
    role: AccessRole,
    type: DocumentType,
  ): boolean {
    return (
      role === 'ProjectLine' && !PROJECT_LINE_VISIBLE_DOCUMENT_TYPES.has(type)
    );
  }

  private assertSelfOnly(viewerEmployeeId: string, employeeId: string): void {
    if (viewerEmployeeId !== employeeId) {
      throw new ForbiddenException(
        'Only the profile owner may upload documents',
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
