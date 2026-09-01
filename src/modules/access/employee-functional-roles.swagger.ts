import { applyDecorators } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { FunctionalRoleEntity } from './entities/functional-role.entity';
import { MyPermissionsEntity } from './entities/my-permissions.entity';

export const SwaggerGetEmployeeFunctionalRoles = () =>
  applyDecorators(
    ApiOkResponse({ type: FunctionalRoleEntity, isArray: true }),
    ApiUnauthorizedResponse({ description: 'Unauthenticated' }),
    ApiForbiddenResponse({ description: 'Missing manage_functional_roles' }),
    ApiNotFoundResponse({ description: 'Employee not found' }),
  );

export const SwaggerSetEmployeeFunctionalRoles = () =>
  applyDecorators(
    ApiOkResponse({ type: FunctionalRoleEntity, isArray: true }),
    ApiUnauthorizedResponse({ description: 'Unauthenticated' }),
    ApiForbiddenResponse({
      description: 'Missing manage_functional_roles or last-admin lockout',
    }),
    ApiNotFoundResponse({
      description: 'Employee or functional role not found',
    }),
  );

export const SwaggerGetMyPermissions = () =>
  applyDecorators(
    ApiOkResponse({ type: MyPermissionsEntity }),
    ApiUnauthorizedResponse({ description: 'Unauthenticated' }),
  );
