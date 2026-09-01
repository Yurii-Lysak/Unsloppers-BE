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
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { SectionAccessGate } from '../contracts/section-access-gate.contract';
import { CurrentUserProvider } from '../contracts/current-user-provider.contract';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTimelineEventDto } from './dto/create-timeline-event.dto';
import { UpdateTimelineEventDto } from './dto/update-timeline-event.dto';
import { TimelineService } from './timeline.service';
import {
  SwaggerCreateTimelineEvent,
  SwaggerDeleteTimelineEvent,
  SwaggerListTimelineEvents,
  SwaggerUpdateTimelineEvent,
} from './timeline.swagger';

@ApiTags('timeline')
@Controller('employees/:employeeId/timeline')
export class TimelineController {
  constructor(
    private readonly timeline: TimelineService,
    private readonly currentUser: CurrentUserProvider,
    private readonly prisma: PrismaService,
    private readonly sectionGate: SectionAccessGate,
  ) {}

  @Get()
  @SwaggerListTimelineEvents()
  async list(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    await this.assertSubjectEmployeeExists(employeeId);
    const audience = await this.sectionGate.requireSection(
      viewerEmployeeId,
      employeeId,
      'S9',
    );
    return this.timeline.listEvents(viewerEmployeeId, employeeId, audience);
  }

  @Post()
  @SwaggerCreateTimelineEvent()
  async create(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: CreateTimelineEventDto,
  ) {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    await this.assertSubjectEmployeeExists(employeeId);
    await this.sectionGate.requireSection(
      viewerEmployeeId,
      employeeId,
      'S9',
      'RW',
    );
    return this.timeline.createManualEvent(viewerEmployeeId, employeeId, dto);
  }

  @Patch(':eventId')
  @SwaggerUpdateTimelineEvent()
  async update(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: UpdateTimelineEventDto,
  ) {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    await this.assertSubjectEmployeeExists(employeeId);
    await this.sectionGate.requireSection(
      viewerEmployeeId,
      employeeId,
      'S9',
      'RW',
    );
    return this.timeline.updateManualEvent(
      viewerEmployeeId,
      employeeId,
      eventId,
      dto,
    );
  }

  @Delete(':eventId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @SwaggerDeleteTimelineEvent()
  async remove(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    await this.assertSubjectEmployeeExists(employeeId);
    await this.sectionGate.requireSection(
      viewerEmployeeId,
      employeeId,
      'S9',
      'RW',
    );
    await this.timeline.softDeleteManualEvent(
      viewerEmployeeId,
      employeeId,
      eventId,
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
