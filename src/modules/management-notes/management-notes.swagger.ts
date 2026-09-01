import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
} from '@nestjs/swagger';
import {
  ManagementNoteEntity,
  ManagementNotesSectionEntity,
} from './entities/management-note.entity';

export const SwaggerListManagementNotes = () =>
  applyDecorators(
    ApiOkResponse({ type: ManagementNotesSectionEntity }),
    ApiForbiddenResponse({
      description: 'Management notes are not accessible',
    }),
    ApiNotFoundResponse({ description: 'Employee not found' }),
    ApiServiceUnavailableResponse({
      description: 'Management notes provider unavailable',
    }),
  );

export const SwaggerCreateManagementNote = () =>
  applyDecorators(
    ApiCreatedResponse({ type: ManagementNoteEntity }),
    ApiBadRequestResponse({ description: 'Invalid note payload' }),
    ApiForbiddenResponse({ description: 'Viewer lacks S7 write access' }),
    ApiNotFoundResponse({ description: 'Employee not found' }),
  );

export const SwaggerUpdateManagementNote = () =>
  applyDecorators(
    ApiOkResponse({ type: ManagementNoteEntity }),
    ApiBadRequestResponse({ description: 'Invalid note payload' }),
    ApiForbiddenResponse({ description: 'Viewer lacks S7 write access' }),
    ApiNotFoundResponse({ description: 'Management note not found' }),
  );

export const SwaggerDeleteManagementNote = () =>
  applyDecorators(
    ApiNoContentResponse({ description: 'Management note deleted' }),
    ApiForbiddenResponse({ description: 'Viewer lacks S7 write access' }),
    ApiNotFoundResponse({ description: 'Management note not found' }),
  );
