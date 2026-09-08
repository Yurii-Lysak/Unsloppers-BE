import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AccessResolver } from '../contracts/access-resolver.contract';
import { CurrentUserProvider } from '../contracts/current-user-provider.contract';
import { PERMISSION_KEYS } from '../contracts/permission-keys';
import { PermissionChecker } from '../contracts/permission-checker.contract';
import { SectionAccessGate } from '../contracts/section-access-gate.contract';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFeedbackRecordDto } from './dto/create-feedback-record.dto';
import { UpdateFeedbackRecordDto } from './dto/update-feedback-record.dto';
import { FeedbacksSectionProvider } from './feedbacks-section.provider';
import { FeedbacksService } from './feedbacks.service';
import {
  SwaggerCreateFeedbackRecord,
  SwaggerDeleteFeedbackRecord,
  SwaggerListFeedbacks,
  SwaggerUpdateFeedbackRecord,
} from './feedbacks.swagger';

@ApiTags('feedbacks')
@Controller('employees/:employeeId/feedbacks')
export class FeedbacksController {
  constructor(
    private readonly feedbacks: FeedbacksService,
    private readonly sectionProvider: FeedbacksSectionProvider,
    private readonly currentUser: CurrentUserProvider,
    private readonly prisma: PrismaService,
    private readonly sectionGate: SectionAccessGate,
    private readonly accessResolver: AccessResolver,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  @Get()
  @SwaggerListFeedbacks()
  async list(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    await this.assertSubjectEmployeeExists(employeeId);
    const audience = await this.sectionGate.requireSection(
      viewerEmployeeId,
      employeeId,
      'S8',
    );
    try {
      return await this.sectionProvider.getSection(
        viewerEmployeeId,
        employeeId,
        audience,
      );
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new ServiceUnavailableException('Feedback unavailable');
    }
  }

  @Post()
  @SwaggerCreateFeedbackRecord()
  async create(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: CreateFeedbackRecordDto,
  ) {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    await this.assertSubjectEmployeeExists(employeeId);
    await this.assertCanCreate(request, viewerEmployeeId, employeeId);
    return this.feedbacks.createRecord(employeeId, viewerEmployeeId, dto);
  }

  @Patch(':feedbackId')
  @SwaggerUpdateFeedbackRecord()
  async update(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('feedbackId', ParseUUIDPipe) feedbackId: string,
    @Body() dto: UpdateFeedbackRecordDto,
  ) {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    await this.assertSubjectEmployeeExists(employeeId);
    await this.sectionGate.requireSection(
      viewerEmployeeId,
      employeeId,
      'S8',
      'RW',
    );
    return this.feedbacks.updateRecord(employeeId, feedbackId, dto);
  }

  @Delete(':feedbackId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @SwaggerDeleteFeedbackRecord()
  async remove(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('feedbackId', ParseUUIDPipe) feedbackId: string,
  ) {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    await this.assertSubjectEmployeeExists(employeeId);
    await this.sectionGate.requireSection(
      viewerEmployeeId,
      employeeId,
      'S8',
      'RW',
    );
    await this.feedbacks.deleteRecord(employeeId, feedbackId);
  }

  private async assertCanCreate(
    request: Request,
    viewerEmployeeId: string,
    subjectEmployeeId: string,
  ): Promise<void> {
    const audience = await this.accessResolver.resolveAudience(
      viewerEmployeeId,
      subjectEmployeeId,
    );
    if (audience.sections.S8 === 'RW') {
      return;
    }

    const { userId } = await this.currentUser.getCurrentUser(request);
    const hasPermission = await this.permissionChecker.hasPermission(
      userId,
      PERMISSION_KEYS.CREATE_FEEDBACK,
    );
    if (
      hasPermission &&
      audience.sections.S8 !== 'none' &&
      audience.sections.S8 !== 'R'
    ) {
      return;
    }

    throw new ForbiddenException('Section S8 is not accessible to this viewer');
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
