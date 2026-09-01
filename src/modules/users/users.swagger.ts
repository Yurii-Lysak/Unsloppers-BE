import { applyDecorators } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { UserEntity } from './entities/user.entity';

export const SwaggerCreateUser = () =>
  applyDecorators(
    ApiCreatedResponse({ type: UserEntity }),
    ApiConflictResponse({ description: 'Email already taken' }),
  );

export const SwaggerFindAllUsers = () =>
  applyDecorators(
    ApiForbiddenResponse({
      description: 'User directory listing is not available in bootcamp scope',
    }),
  );

export const SwaggerFindOneUser = () =>
  applyDecorators(
    ApiOkResponse({ type: UserEntity }),
    ApiForbiddenResponse({
      description: 'May only read your own user record',
    }),
    ApiNotFoundResponse({ description: 'User not found' }),
  );

export const SwaggerUpdateUser = () =>
  applyDecorators(
    ApiOkResponse({ type: UserEntity }),
    ApiNotFoundResponse({ description: 'User not found' }),
    ApiConflictResponse({ description: 'Email already taken' }),
  );

export const SwaggerDeleteUser = () =>
  applyDecorators(
    ApiNoContentResponse({ description: 'User deleted' }),
    ApiNotFoundResponse({ description: 'User not found' }),
  );
