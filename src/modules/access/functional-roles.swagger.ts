import { applyDecorators } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { FunctionalRoleEntity } from './entities/functional-role.entity';
import { PermissionCatalogEntryEntity } from './entities/permission-catalog-entry.entity';

export const SwaggerListFunctionalRoles = () =>
  applyDecorators(
    ApiOkResponse({ type: FunctionalRoleEntity, isArray: true }),
    ApiForbiddenResponse({ description: 'Missing manage_functional_roles' }),
  );

export const SwaggerCreateFunctionalRole = () =>
  applyDecorators(
    ApiCreatedResponse({ type: FunctionalRoleEntity }),
    ApiForbiddenResponse({ description: 'Missing manage_functional_roles' }),
    ApiConflictResponse({ description: 'Duplicate role name' }),
  );

export const SwaggerUpdateFunctionalRole = () =>
  applyDecorators(
    ApiOkResponse({ type: FunctionalRoleEntity }),
    ApiForbiddenResponse({ description: 'Missing manage_functional_roles' }),
    ApiNotFoundResponse({ description: 'Role not found' }),
    ApiConflictResponse({ description: 'Duplicate role name' }),
  );

export const SwaggerDeleteFunctionalRole = () =>
  applyDecorators(
    ApiNoContentResponse({ description: 'Role deleted' }),
    ApiForbiddenResponse({ description: 'Missing manage_functional_roles' }),
    ApiNotFoundResponse({ description: 'Role not found' }),
    ApiConflictResponse({
      description: 'Built-in role or role with assignments',
    }),
  );

export const SwaggerGetPermissionCatalog = () =>
  applyDecorators(
    ApiOkResponse({ type: PermissionCatalogEntryEntity, isArray: true }),
    ApiForbiddenResponse({ description: 'Missing manage_functional_roles' }),
  );
