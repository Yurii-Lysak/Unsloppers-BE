import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  HttpCode,
  HttpStatus,
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
import { SectionAccessGate } from '../contracts/section-access-gate.contract';
import { CurrentUserProvider } from '../contracts/current-user-provider.contract';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEmergencyContactDto } from './dto/create-emergency-contact.dto';
import { UpdateEmergencyContactDto } from './dto/update-emergency-contact.dto';
import { EmergencyContactEntity } from './entities/personal-contacts.entity';
import { PersonalContactsService } from './personal-contacts.service';

const writeValidationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

@ApiTags('emergency-contacts')
@Controller('employees/:employeeId/emergency-contacts')
export class EmergencyContactsController {
  constructor(
    private readonly personalContacts: PersonalContactsService,
    private readonly currentUser: CurrentUserProvider,
    private readonly prisma: PrismaService,
    private readonly sectionGate: SectionAccessGate,
  ) {}

  @Post()
  @UsePipes(writeValidationPipe)
  async create(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: CreateEmergencyContactDto,
  ): Promise<EmergencyContactEntity> {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    await this.assertSubjectEmployeeExists(employeeId);
    await this.sectionGate.requireSection(
      viewerEmployeeId,
      employeeId,
      'S3',
      'RW',
    );
    return this.personalContacts.createEmergencyContact(employeeId, dto);
  }

  @Patch(':emergencyContactId')
  @UsePipes(writeValidationPipe)
  async update(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('emergencyContactId', ParseUUIDPipe) emergencyContactId: string,
    @Body() dto: UpdateEmergencyContactDto,
  ): Promise<EmergencyContactEntity> {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    await this.assertSubjectEmployeeExists(employeeId);
    await this.sectionGate.requireSection(
      viewerEmployeeId,
      employeeId,
      'S3',
      'RW',
    );
    return this.personalContacts.updateEmergencyContact(
      employeeId,
      emergencyContactId,
      dto,
    );
  }

  @Delete(':emergencyContactId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('emergencyContactId', ParseUUIDPipe) emergencyContactId: string,
  ): Promise<void> {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    await this.assertSubjectEmployeeExists(employeeId);
    await this.sectionGate.requireSection(
      viewerEmployeeId,
      employeeId,
      'S3',
      'RW',
    );
    await this.personalContacts.deleteEmergencyContact(
      employeeId,
      emergencyContactId,
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
