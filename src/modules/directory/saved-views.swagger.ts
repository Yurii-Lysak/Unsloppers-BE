import { applyDecorators } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { SavedViewEntity } from './entities/saved-view.entity';

export const SwaggerListSavedViews = () =>
  applyDecorators(
    ApiOkResponse({ type: SavedViewEntity, isArray: true }),
  );

export const SwaggerCreateSavedView = () =>
  applyDecorators(
    ApiOkResponse({ type: SavedViewEntity }),
    ApiForbiddenResponse({ description: 'Authenticated user has no employee record' }),
  );

export const SwaggerUpdateSavedView = () =>
  applyDecorators(
    ApiOkResponse({ type: SavedViewEntity }),
    ApiNotFoundResponse({ description: 'Saved view not found' }),
    ApiForbiddenResponse({ description: 'Only the owner can modify this view' }),
  );

export const SwaggerDeleteSavedView = () =>
  applyDecorators(
    ApiOkResponse({ description: 'Saved view deleted' }),
    ApiNotFoundResponse({ description: 'Saved view not found' }),
    ApiForbiddenResponse({ description: 'Only the owner can delete this view' }),
  );

export const SwaggerShareSavedView = () =>
  applyDecorators(
    ApiOkResponse({ type: SavedViewEntity }),
    ApiNotFoundResponse({ description: 'Saved view or recipient not found' }),
    ApiForbiddenResponse({ description: 'Only the owner can share this view' }),
  );
