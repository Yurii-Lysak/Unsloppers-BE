import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AccessResolver } from '../contracts/access-resolver.contract';
import { CurrentUserProvider } from '../contracts/current-user-provider.contract';
import { PERMISSION_KEYS } from '../contracts/permission-keys';
import { PermissionChecker } from '../contracts/permission-checker.contract';
import { SectionAccessGate } from '../contracts/section-access-gate.contract';
import { PrismaService } from '../../prisma/prisma.service';
import { CdsService } from './cds.service';
import { CreateIdpRecordDto } from './dto/create-idp-record.dto';
import { UpdateIdpRecordDto } from './dto/update-idp-record.dto';
import { CdsIdpRecordEntity } from './entities/cds-section.entity';
import { RejectIdpCompletedAtWriteInterceptor } from './reject-idp-completed-at-write.interceptor';

@ApiTags('cds')
@Controller('employees/:employeeId/idp-records')
export class IdpRecordsController {
  constructor(
    private readonly cds: CdsService,
    private readonly currentUser: CurrentUserProvider,
    private readonly prisma: PrismaService,
    private readonly sectionGate: SectionAccessGate,
    private readonly accessResolver: AccessResolver,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  @Post()
  @UseInterceptors(RejectIdpCompletedAtWriteInterceptor)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  async create(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: CreateIdpRecordDto,
  ): Promise<CdsIdpRecordEntity> {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    await this.assertSubjectEmployeeExists(employeeId);
    await this.assertCanCreateOrUpdate(request, viewerEmployeeId, employeeId);
    return this.cds.createIdpRecord(employeeId, dto);
  }

  @Patch(':idpId')
  @UseInterceptors(RejectIdpCompletedAtWriteInterceptor)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  async update(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('idpId', ParseUUIDPipe) idpId: string,
    @Body() dto: UpdateIdpRecordDto,
  ): Promise<CdsIdpRecordEntity> {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    await this.assertSubjectEmployeeExists(employeeId);
    await this.assertCanCreateOrUpdate(request, viewerEmployeeId, employeeId);
    return this.cds.updateIdpRecord(employeeId, idpId, dto);
  }

  @Post(':idpId/complete')
  @HttpCode(200)
  async complete(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('idpId', ParseUUIDPipe) idpId: string,
  ): Promise<CdsIdpRecordEntity> {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    await this.assertSubjectEmployeeExists(employeeId);
    if (viewerEmployeeId !== employeeId) {
      throw new ForbiddenException(
        'Only the profile owner may complete this IDP record',
      );
    }
    await this.sectionGate.requireSection(viewerEmployeeId, employeeId, 'S12');
    return this.cds.completeIdpRecord(employeeId, idpId);
  }

  private async assertCanCreateOrUpdate(
    request: Request,
    viewerEmployeeId: string,
    subjectEmployeeId: string,
  ): Promise<void> {
    const audience = await this.accessResolver.resolveAudience(
      viewerEmployeeId,
      subjectEmployeeId,
    );
    if (audience.sections.S12 === 'RW') {
      return;
    }

    const { userId } = await this.currentUser.getCurrentUser(request);
    const hasPermission = await this.permissionChecker.hasPermission(
      userId,
      PERMISSION_KEYS.MAINTAIN_CDS_RECORDS,
    );
    if (hasPermission && audience.sections.S12 !== 'none') {
      return;
    }

    throw new ForbiddenException(
      'Section S12 is not accessible to this viewer',
    );
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
