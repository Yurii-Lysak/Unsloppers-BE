import { Controller, Get, Param, ParseUUIDPipe, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUserProvider } from '../contracts/current-user-provider.contract';
import { EmployeeSummaryEntity } from './entities/employee-summary.entity';
import { EmployeesService } from './employees.service';
import { SwaggerGetEmployee, SwaggerListEmployees } from './employees.swagger';

/**
 * Minimal employee directory reads for Story 1.5 navigation shell.
 * Story 1.8 adds C1 access-matrix filtering — until then every authenticated
 * user sees the full seeded list (24 bootcamp accounts).
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
  async list(@Req() request: Request): Promise<EmployeeSummaryEntity[]> {
    await this.currentUser.getCurrentUser(request);
    return this.employees.list();
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
