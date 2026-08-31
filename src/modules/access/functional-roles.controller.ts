import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  getPermissionCatalog,
  PERMISSION_KEYS,
} from '../contracts/permission-keys';
import { CurrentUserProvider } from '../contracts/current-user-provider.contract';
import { PermissionChecker } from '../contracts/permission-checker.contract';
import { CreateFunctionalRoleDto } from './dto/create-functional-role.dto';
import { UpdateFunctionalRoleDto } from './dto/update-functional-role.dto';
import { FunctionalRoleEntity } from './entities/functional-role.entity';
import { PermissionCatalogEntryEntity } from './entities/permission-catalog-entry.entity';
import { FunctionalRoleService } from './functional-role.service';
import {
  SwaggerCreateFunctionalRole,
  SwaggerDeleteFunctionalRole,
  SwaggerGetPermissionCatalog,
  SwaggerListFunctionalRoles,
  SwaggerUpdateFunctionalRole,
} from './functional-roles.swagger';

@ApiTags('functional-roles')
@Controller('functional-roles')
export class FunctionalRolesController {
  constructor(
    private readonly functionalRoles: FunctionalRoleService,
    private readonly permissionChecker: PermissionChecker,
    private readonly currentUser: CurrentUserProvider,
  ) {}

  @Get()
  @SwaggerListFunctionalRoles()
  async list(@Req() request: Request): Promise<FunctionalRoleEntity[]> {
    await this.assertManageFunctionalRoles(request);
    return this.functionalRoles.list();
  }

  @Post()
  @SwaggerCreateFunctionalRole()
  async create(
    @Req() request: Request,
    @Body() dto: CreateFunctionalRoleDto,
  ): Promise<FunctionalRoleEntity> {
    await this.assertManageFunctionalRoles(request);
    return this.functionalRoles.create(dto.name, dto.permissionKeys ?? []);
  }

  @Patch(':id')
  @SwaggerUpdateFunctionalRole()
  async update(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFunctionalRoleDto,
  ): Promise<FunctionalRoleEntity> {
    await this.assertManageFunctionalRoles(request);
    return this.functionalRoles.update(id, {
      name: dto.name,
      permissionKeys: dto.permissionKeys,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @SwaggerDeleteFunctionalRole()
  async delete(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.assertManageFunctionalRoles(request);
    await this.functionalRoles.delete(id);
  }

  private async assertManageFunctionalRoles(request: Request): Promise<void> {
    const { userId } = await this.currentUser.getCurrentUser(request);
    const allowed = await this.permissionChecker.hasPermission(
      userId,
      PERMISSION_KEYS.MANAGE_FUNCTIONAL_ROLES,
    );
    if (!allowed) {
      throw new ForbiddenException();
    }
  }
}

@ApiTags('permissions')
@Controller('permissions')
export class PermissionsCatalogController {
  constructor(
    private readonly permissionChecker: PermissionChecker,
    private readonly currentUser: CurrentUserProvider,
  ) {}

  @Get('catalog')
  @SwaggerGetPermissionCatalog()
  async catalog(
    @Req() request: Request,
  ): Promise<PermissionCatalogEntryEntity[]> {
    const { userId } = await this.currentUser.getCurrentUser(request);
    const allowed = await this.permissionChecker.hasPermission(
      userId,
      PERMISSION_KEYS.MANAGE_FUNCTIONAL_ROLES,
    );
    if (!allowed) {
      throw new ForbiddenException();
    }
    return getPermissionCatalog();
  }
}
