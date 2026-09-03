import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
} from '@nestjs/swagger';
import {
  ActionItemReadEntity,
  ActionItemsSectionEntity,
  AuthoredActionItemReadEntity,
} from './entities/action-item.entity';

export const SwaggerListActionItems = () =>
  applyDecorators(
    ApiOkResponse({ type: ActionItemsSectionEntity }),
    ApiForbiddenResponse({ description: 'Action items are not accessible' }),
    ApiNotFoundResponse({ description: 'Employee not found' }),
    ApiServiceUnavailableResponse({
      description: 'Action items provider unavailable',
    }),
  );

export const SwaggerCreateActionItem = () =>
  applyDecorators(
    ApiCreatedResponse({ type: ActionItemReadEntity }),
    ApiBadRequestResponse({ description: 'Invalid action item payload' }),
    ApiForbiddenResponse({ description: 'Viewer lacks S14 create access' }),
    ApiNotFoundResponse({ description: 'Employee not found' }),
  );

export const SwaggerListAuthoredActionItems = () =>
  applyDecorators(
    ApiOkResponse({ type: [AuthoredActionItemReadEntity] }),
    ApiForbiddenResponse({
      description: 'Authenticated user has no employee record',
    }),
  );
