import {
  Body,
  Controller,
  ForbiddenException,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AccessResolver } from '../contracts/access-resolver.contract';
import { CurrentUserProvider } from '../contracts/current-user-provider.contract';
import { PERMISSION_KEYS } from '../contracts/permission-keys';
import { PermissionChecker } from '../contracts/permission-checker.contract';
import { PrismaService } from '../../prisma/prisma.service';
import { CdsService } from './cds.service';
import { CreateCdsAssessmentDto } from './dto/create-cds-assessment.dto';
import { UpdateCdsAssessmentConclusionDto } from './dto/update-cds-assessment-conclusion.dto';
import { CdsAssessmentEntryEntity } from './entities/cds-section.entity';

@ApiTags('cds')
@Controller('employees/:employeeId/cds-assessments')
export class CdsAssessmentsController {
  constructor(
    private readonly cds: CdsService,
    private readonly currentUser: CurrentUserProvider,
    private readonly prisma: PrismaService,
    private readonly accessResolver: AccessResolver,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  @Post()
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
    @Body() dto: CreateCdsAssessmentDto,
  ): Promise<CdsAssessmentEntryEntity> {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    await this.assertSubjectEmployeeExists(employeeId);
    await this.assertCanCreateOrUpdate(request, viewerEmployeeId, employeeId);
    return this.cds.createAssessment(employeeId, dto);
  }

  @Patch(':assessmentId')
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  async updateConclusion(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Body() dto: UpdateCdsAssessmentConclusionDto,
  ): Promise<CdsAssessmentEntryEntity> {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    await this.assertSubjectEmployeeExists(employeeId);
    await this.assertCanCreateOrUpdate(request, viewerEmployeeId, employeeId);
    return this.cds.updateAssessmentConclusion(employeeId, assessmentId, dto);
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
