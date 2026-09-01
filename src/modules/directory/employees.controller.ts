import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUserProvider } from '../contracts/current-user-provider.contract';
import { ListEmployeesQueryDto } from './dto/list-employees-query.dto';
import { EmployeesService } from './employees.service';
import { SwaggerListEmployees } from './employees.swagger';

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
}
