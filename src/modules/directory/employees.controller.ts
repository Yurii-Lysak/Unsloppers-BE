import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUserProvider } from '../contracts/current-user-provider.contract';
import { UpdateEmployeeFieldDto } from './dto/update-employee-field.dto';
import { EmployeeFieldUpdateEntity } from './entities/employee-field-update.entity';
import { ListEmployeesQueryDto } from './dto/list-employees-query.dto';
import { EmployeeLookupEntity } from './entities/employee-lookup.entity';
import { EmployeeSummaryEntity } from './entities/employee-summary.entity';
import { EmployeesService } from './employees.service';
import {
  SwaggerGetEmployee,
  SwaggerListEmployees,
  SwaggerLookupEmployees,
  SwaggerUpdateEmployeeField,
} from './employees.swagger';

@ApiTags('employees')
@Controller('employees')
export class EmployeesController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly currentUser: CurrentUserProvider,
  ) {}

  @Get()
  @SwaggerListEmployees()
  async list(@Req() request: Request, @Query() query: ListEmployeesQueryDto) {
    const { userId } = await this.currentUser.getCurrentUser(request);
    return this.employees.listEmployees(userId, query);
  }

  // Must stay before `:employeeId` — Nest matches static segments in
  // declaration order, and `lookup` would otherwise fail `ParseUUIDPipe`.
  @Get('lookup')
  @SwaggerLookupEmployees()
  async lookup(@Req() request: Request): Promise<EmployeeLookupEntity[]> {
    await this.currentUser.getCurrentUser(request);
    return this.employees.listLookupOptions();
  }

  @Get(':employeeId')
  @SwaggerGetEmployee()
  async getOne(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ): Promise<EmployeeSummaryEntity> {
    await this.currentUser.getCurrentUser(request);
    return this.employees.getById(employeeId);
  }

  @Patch(':employeeId/fields/:fieldId')
  @SwaggerUpdateEmployeeField()
  async updateField(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('fieldId') fieldId: string,
    @Body() dto: UpdateEmployeeFieldDto,
  ): Promise<EmployeeFieldUpdateEntity> {
    const { userId } = await this.currentUser.getCurrentUser(request);
    return this.employees.updateEmployeeField(userId, employeeId, fieldId, dto);
  }
}
