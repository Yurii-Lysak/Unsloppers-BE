import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUserProvider } from '../contracts/current-user-provider.contract';
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
  ) {}

  @Get()
  @SwaggerListTimelineEvents()
  async list(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    const { userId } = await this.currentUser.getCurrentUser(request);
    return this.timeline.listEvents(userId, employeeId);
  }

  @Post()
  @SwaggerCreateTimelineEvent()
  async create(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: CreateTimelineEventDto,
  ) {
    const { userId } = await this.currentUser.getCurrentUser(request);
    return this.timeline.createManualEvent(userId, employeeId, dto);
  }

  @Patch(':eventId')
  @SwaggerUpdateTimelineEvent()
  async update(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: UpdateTimelineEventDto,
  ) {
    const { userId } = await this.currentUser.getCurrentUser(request);
    return this.timeline.updateManualEvent(userId, employeeId, eventId, dto);
  }

  @Delete(':eventId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @SwaggerDeleteTimelineEvent()
  async remove(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    const { userId } = await this.currentUser.getCurrentUser(request);
    await this.timeline.softDeleteManualEvent(userId, employeeId, eventId);
  }
}
