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
import { ActionItemsSectionProvider } from './action-items-section.provider';
import { ActionItemsService } from './action-items.service';
import { CreateActionItemDto } from './dto/create-action-item.dto';
import {
  SwaggerCreateActionItem,
  SwaggerListActionItems,
  SwaggerListAuthoredActionItems,
} from './action-items.swagger';

@ApiTags('action-items')
@Controller()
export class ActionItemsController {
  constructor(
    private readonly actionItems: ActionItemsService,
    private readonly sectionProvider: ActionItemsSectionProvider,
    private readonly currentUser: CurrentUserProvider,
    private readonly prisma: PrismaService,
    private readonly sectionGate: SectionAccessGate,
    private readonly accessResolver: AccessResolver,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  @Get('employees/:employeeId/action-items')
  @SwaggerListActionItems()
  async list(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    await this.assertSubjectEmployeeExists(employeeId);
    const audience = await this.sectionGate.requireSection(
      viewerEmployeeId,
      employeeId,
      'S14',
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
      throw new ServiceUnavailableException('Action items unavailable');
    }
  }

  @Post('employees/:employeeId/action-items')
  @SwaggerCreateActionItem()
  async create(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: CreateActionItemDto,
  ) {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    await this.assertSubjectEmployeeExists(employeeId);
    await this.assertCanCreate(request, viewerEmployeeId, employeeId);
    return this.actionItems.createManualItem(employeeId, viewerEmployeeId, dto);
  }

  @Get('me/authored-action-items')
  @SwaggerListAuthoredActionItems()
  async listAuthored(@Req() request: Request) {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    return this.actionItems.listAuthoredOpenItems(viewerEmployeeId);
  }

  private async assertCanCreate(
    request: Request,
    viewerEmployeeId: string,
    assigneeEmployeeId: string,
  ): Promise<void> {
    const audience = await this.accessResolver.resolveAudience(
      viewerEmployeeId,
      assigneeEmployeeId,
    );
    if (audience.sections.S14 === 'RW') {
      return;
    }

    const { userId } = await this.currentUser.getCurrentUser(request);
    const hasPermission = await this.permissionChecker.hasPermission(
      userId,
      PERMISSION_KEYS.CREATE_ACTION_ITEMS,
    );
    if (hasPermission && audience.sections.S14 !== 'none') {
      return;
    }

    throw new ForbiddenException(
      'Section S14 is not accessible to this viewer',
    );
  }

  private async assertSubjectEmployeeExists(employeeId: string): Promise<void> {
    const subject = await this.prisma.employee.findFirst({
      where: { id: employeeId, employmentStatus: 'active' },
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
