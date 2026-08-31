import { applyDecorators } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { TimelineEventEntity } from './entities/timeline-event.entity';

export const SwaggerListTimelineEvents = () =>
  applyDecorators(
    ApiOkResponse({ type: TimelineEventEntity, isArray: true }),
    ApiForbiddenResponse({ description: 'Career timeline is not accessible' }),
    ApiNotFoundResponse({ description: 'Employee not found' }),
  );

export const SwaggerCreateTimelineEvent = () =>
  applyDecorators(
    ApiCreatedResponse({ type: TimelineEventEntity }),
    ApiForbiddenResponse({
      description:
        'Viewer lacks S9 access or is not a Unit Manager / People Partner',
    }),
    ApiNotFoundResponse({ description: 'Employee not found' }),
    ApiConflictResponse({
      description:
        'Duplicate manual event for the same type and effective date',
    }),
  );

export const SwaggerUpdateTimelineEvent = () =>
  applyDecorators(
    ApiOkResponse({ type: TimelineEventEntity }),
    ApiForbiddenResponse({
      description: 'Viewer lacks write access or event is system-generated',
    }),
    ApiNotFoundResponse({ description: 'Timeline event not found' }),
    ApiConflictResponse({
      description: 'Update would duplicate an existing manual event key',
    }),
  );

export const SwaggerDeleteTimelineEvent = () =>
  applyDecorators(
    ApiNoContentResponse({ description: 'Timeline event soft-deleted' }),
    ApiForbiddenResponse({
      description: 'Viewer lacks write access or event is system-generated',
    }),
    ApiNotFoundResponse({ description: 'Timeline event not found' }),
  );
