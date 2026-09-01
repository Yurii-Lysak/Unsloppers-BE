import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Body,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { PERMISSION_KEYS } from '../contracts/permission-keys';
import { CurrentUserProvider } from '../contracts/current-user-provider.contract';
import { PermissionChecker } from '../contracts/permission-checker.contract';
import { SetEmployeeFunctionalRolesDto } from './dto/set-employee-functional-roles.dto';
import { FunctionalRoleEntity } from './entities/functional-role.entity';
import { FunctionalRoleAssignmentService } from './functional-role-assignment.service';
import {
  SwaggerGetEmployeeFunctionalRoles,
  SwaggerSetEmployeeFunctionalRoles,
} from './employee-functional-roles.swagger';

@ApiTags('employees')
@Controller('employees/:employeeId/functional-roles')
export class EmployeeFunctionalRolesController {
  constructor(
    private readonly assignments: FunctionalRoleAssignmentService,
    private readonly permissionChecker: PermissionChecker,
    private readonly currentUser: CurrentUserProvider,
  ) {}

  @Get()
  @SwaggerGetEmployeeFunctionalRoles()
  async list(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ): Promise<FunctionalRoleEntity[]> {
    await this.assertManageFunctionalRoles(request);
    return this.assignments.listForEmployee(employeeId);
  }

  @Put()
  @SwaggerSetEmployeeFunctionalRoles()
  async replace(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: SetEmployeeFunctionalRolesDto,
  ): Promise<FunctionalRoleEntity[]> {
    const { userId } = await this.assertManageFunctionalRoles(request);
    return this.assignments.setAssignments(employeeId, dto.roleIds, {
      callerUserId: userId,
    });
  }

  private async assertManageFunctionalRoles(
    request: Request,
  ): Promise<{ userId: string }> {
    const { userId } = await this.currentUser.getCurrentUser(request);
    const allowed = await this.permissionChecker.hasPermission(
      userId,
      PERMISSION_KEYS.MANAGE_FUNCTIONAL_ROLES,
    );
    if (!allowed) {
      throw new ForbiddenException();
    }
    return { userId };
  }
}
