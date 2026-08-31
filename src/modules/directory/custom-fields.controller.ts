import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUserProvider } from '../contracts/current-user-provider.contract';
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
    return this.customFields.listDefinitions(userId);
  }

  @Get('values/:employeeId')
  @SwaggerListCustomFieldValues()
  async listValues(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    const { userId } = await this.currentUser.getCurrentUser(request);
    return this.customFields.listValuesForEmployee(userId, employeeId);
  }

  @Get(':fieldId')
  @SwaggerGetCustomField()
  async findOne(
    @Req() request: Request,
    @Param('fieldId', ParseUUIDPipe) fieldId: string,
  ) {
    const { userId } = await this.currentUser.getCurrentUser(request);
    return this.customFields.getDefinition(userId, fieldId);
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
    return this.customFields.setValue(userId, employeeId, fieldId, dto);
  }
}
