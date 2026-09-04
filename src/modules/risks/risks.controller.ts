import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
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
import { CreateRiskRecordDto } from './dto/create-risk-record.dto';
import { RisksSectionProvider } from './risks-section.provider';
import { RisksService } from './risks.service';
import { SwaggerCreateRiskRecord, SwaggerListRisks } from './risks.swagger';

@ApiTags('risks')
@Controller('employees/:employeeId/risks')
export class RisksController {
  constructor(
    private readonly risks: RisksService,
    private readonly sectionProvider: RisksSectionProvider,
    private readonly currentUser: CurrentUserProvider,
    private readonly prisma: PrismaService,
    private readonly sectionGate: SectionAccessGate,
    private readonly accessResolver: AccessResolver,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  @Get()
  @SwaggerListRisks()
  async list(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    await this.assertSubjectEmployeeExists(employeeId);
    const audience = await this.sectionGate.requireSection(
      viewerEmployeeId,
      employeeId,
      'S6',
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
      throw new ServiceUnavailableException('Risks unavailable');
    }
  }

  @Post()
  @SwaggerCreateRiskRecord()
  async create(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: CreateRiskRecordDto,
  ) {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    await this.assertSubjectEmployeeExists(employeeId);
    await this.assertCanCreate(request, viewerEmployeeId, employeeId);
    return this.risks.createRecord(employeeId, viewerEmployeeId, dto);
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
    if (audience.sections.S6 === 'RW') {
      return;
    }

    const { userId } = await this.currentUser.getCurrentUser(request);
    const hasPermission = await this.permissionChecker.hasPermission(
      userId,
      PERMISSION_KEYS.CREATE_EDIT_RISKS,
    );
    if (hasPermission && audience.sections.S6 !== 'none') {
      return;
    }

    throw new ForbiddenException('Section S6 is not accessible to this viewer');
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
