import { Controller, Get, Param, ParseUUIDPipe, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUserProvider } from '../contracts/current-user-provider.contract';
import { ListEmployeesQueryDto } from './dto/list-employees-query.dto';
import { EmployeeSummaryEntity } from './entities/employee-summary.entity';
import { EmployeesService } from './employees.service';
import { SwaggerGetEmployee, SwaggerListEmployees } from './employees.swagger';

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
