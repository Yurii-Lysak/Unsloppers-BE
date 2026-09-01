import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { SectionAccessGate } from '../contracts/section-access-gate.contract';
import { CurrentUserProvider } from '../contracts/current-user-provider.contract';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomFieldsService } from './custom-fields.service';
import {
  SwaggerCreateCustomField,
  SwaggerGetCustomField,
  SwaggerListCustomFieldValues,
  SwaggerListCustomFields,
  SwaggerSetCustomFieldValue,
} from './custom-fields.swagger';
import { CreateCustomFieldDto } from './dto/create-custom-field.dto';
import { SetCustomFieldValueDto } from './dto/set-custom-field-value.dto';

@ApiTags('custom-fields')
@Controller('custom-fields')
export class CustomFieldsController {
  constructor(
    private readonly customFields: CustomFieldsService,
    private readonly currentUser: CurrentUserProvider,
    private readonly prisma: PrismaService,
    private readonly sectionGate: SectionAccessGate,
  ) {}

  @Post()
  @SwaggerCreateCustomField()
  async create(@Req() request: Request, @Body() dto: CreateCustomFieldDto) {
    const { userId } = await this.currentUser.getCurrentUser(request);
    return this.customFields.createDefinition(userId, dto);
  }

  @Get()
  @SwaggerListCustomFields()
  async findAll(@Req() request: Request) {
    const { userId } = await this.currentUser.getCurrentUser(request);
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    return this.customFields.listDefinitions(userId, viewerEmployeeId);
  }

  @Get('values/:employeeId')
  @SwaggerListCustomFieldValues()
  async listValues(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    const { userId } = await this.currentUser.getCurrentUser(request);
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    await this.assertSubjectEmployeeExists(employeeId);
    await this.sectionGate.requireSection(viewerEmployeeId, employeeId, 'S16');
    return this.customFields.listValuesForEmployee(
      userId,
      viewerEmployeeId,
      employeeId,
    );
  }

  @Get(':fieldId')
  @SwaggerGetCustomField()
  async findOne(
    @Req() request: Request,
    @Param('fieldId', ParseUUIDPipe) fieldId: string,
  ) {
    const { userId } = await this.currentUser.getCurrentUser(request);
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    return this.customFields.getDefinition(userId, viewerEmployeeId, fieldId);
  }

  @Put(':fieldId/values/:employeeId')
  @SwaggerSetCustomFieldValue()
  async setValue(
    @Req() request: Request,
    @Param('fieldId', ParseUUIDPipe) fieldId: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: SetCustomFieldValueDto,
  ) {
    const { userId } = await this.currentUser.getCurrentUser(request);
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    await this.assertSubjectEmployeeExists(employeeId);
    await this.sectionGate.requireSection(
      viewerEmployeeId,
      employeeId,
      'S16',
      'RW',
    );
    return this.customFields.setValue(
      userId,
      viewerEmployeeId,
      employeeId,
      fieldId,
      dto,
    );
  }

  private async assertSubjectEmployeeExists(employeeId: string): Promise<void> {
    const subject = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true },
    });
    if (!subject) {
      throw new NotFoundException('Employee not found');
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
