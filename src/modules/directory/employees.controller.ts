import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUserProvider } from '../contracts/current-user-provider.contract';
import { ListEmployeesQueryDto } from './dto/list-employees-query.dto';
import { EmployeeSummaryEntity } from './entities/employee-summary.entity';
import { EmployeesService } from './employees.service';
import { SwaggerGetEmployee, SwaggerListEmployees } from './employees.swagger';

/**
 * `list` (Story 3.1) returns the C2 FieldRegistry-backed, viewer-masked
 * column projection. `getOne` (Story 1.5/1.6) returns an S1-safe
 * `EmployeeSummaryEntity` (`id`, `displayName` only, per Story 1.8) for
 * profile navigation — it never carries per-field data.
 */
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

  @Get(':employeeId')
  @SwaggerGetEmployee()
  async getOne(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ): Promise<EmployeeSummaryEntity> {
    await this.currentUser.getCurrentUser(request);
    return this.employees.getById(employeeId);
  }
}
