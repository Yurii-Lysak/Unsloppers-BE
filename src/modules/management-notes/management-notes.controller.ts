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
import { SectionAccessGate } from '../contracts/section-access-gate.contract';
import { CurrentUserProvider } from '../contracts/current-user-provider.contract';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateManagementNoteDto } from './dto/create-management-note.dto';
import { UpdateManagementNoteDto } from './dto/update-management-note.dto';
import { ManagementNotesSectionProvider } from './management-notes-section.provider';
import { ManagementNotesService } from './management-notes.service';
import {
  SwaggerCreateManagementNote,
  SwaggerDeleteManagementNote,
  SwaggerListManagementNotes,
  SwaggerUpdateManagementNote,
} from './management-notes.swagger';

@ApiTags('management-notes')
@Controller('employees/:employeeId/management-notes')
export class ManagementNotesController {
  constructor(
    private readonly managementNotes: ManagementNotesService,
    private readonly sectionProvider: ManagementNotesSectionProvider,
    private readonly currentUser: CurrentUserProvider,
    private readonly prisma: PrismaService,
    private readonly sectionGate: SectionAccessGate,
  ) {}

  @Get()
  @SwaggerListManagementNotes()
  async list(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    await this.assertSubjectEmployeeExists(employeeId);
    const audience = await this.sectionGate.requireSection(
      viewerEmployeeId,
      employeeId,
      'S7',
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
      throw new ServiceUnavailableException('Management notes unavailable');
    }
  }

  @Post()
  @SwaggerCreateManagementNote()
  async create(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: CreateManagementNoteDto,
  ) {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    await this.assertSubjectEmployeeExists(employeeId);
    await this.sectionGate.requireSection(
      viewerEmployeeId,
      employeeId,
      'S7',
      'RW',
    );
    return this.managementNotes.createNote(employeeId, viewerEmployeeId, dto);
  }

  @Patch(':noteId')
  @SwaggerUpdateManagementNote()
  async update(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @Body() dto: UpdateManagementNoteDto,
  ) {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    await this.assertSubjectEmployeeExists(employeeId);
    await this.sectionGate.requireSection(
      viewerEmployeeId,
      employeeId,
      'S7',
      'RW',
    );
    return this.managementNotes.updateNote(employeeId, noteId, dto);
  }

  @Delete(':noteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @SwaggerDeleteManagementNote()
  async remove(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('noteId', ParseUUIDPipe) noteId: string,
  ) {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    await this.assertSubjectEmployeeExists(employeeId);
    await this.sectionGate.requireSection(
      viewerEmployeeId,
      employeeId,
      'S7',
      'RW',
    );
    await this.managementNotes.deleteNote(employeeId, noteId);
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
