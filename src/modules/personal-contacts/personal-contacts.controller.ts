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
import { CreateContactMethodDto } from './dto/create-contact-method.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { UpdateContactMethodDto } from './dto/update-contact-method.dto';
import {
  PersonalContactMethodEntity,
  PersonalContactsSectionEntity,
} from './entities/personal-contacts.entity';
import { PersonalContactsService } from './personal-contacts.service';

const writeValidationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

@ApiTags('personal-contacts')
@Controller('employees/:employeeId/personal-contacts')
export class PersonalContactsController {
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
    @Body() dto: CreateContactMethodDto,
  ): Promise<PersonalContactMethodEntity> {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    await this.assertSubjectEmployeeExists(employeeId);
    await this.sectionGate.requireSection(
      viewerEmployeeId,
      employeeId,
      'S2',
      'RW',
    );
    return this.personalContacts.createContactMethod(employeeId, dto);
  }

  @Patch('address')
  @UsePipes(writeValidationPipe)
  async updateAddress(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: UpdateAddressDto,
  ): Promise<PersonalContactsSectionEntity> {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    await this.assertSubjectEmployeeExists(employeeId);
    await this.sectionGate.requireSection(
      viewerEmployeeId,
      employeeId,
      'S2',
      'RW',
    );
    return this.personalContacts.updateAddress(employeeId, dto);
  }

  @Patch(':contactId')
  @UsePipes(writeValidationPipe)
  async update(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body() dto: UpdateContactMethodDto,
  ): Promise<PersonalContactMethodEntity> {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    await this.assertSubjectEmployeeExists(employeeId);
    await this.sectionGate.requireSection(
      viewerEmployeeId,
      employeeId,
      'S2',
      'RW',
    );
    return this.personalContacts.updateContactMethod(
      employeeId,
      contactId,
      dto,
    );
  }

  @Delete(':contactId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
  ): Promise<void> {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    await this.assertSubjectEmployeeExists(employeeId);
    await this.sectionGate.requireSection(
      viewerEmployeeId,
      employeeId,
      'S2',
      'RW',
    );
    await this.personalContacts.deleteContactMethod(employeeId, contactId);
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
