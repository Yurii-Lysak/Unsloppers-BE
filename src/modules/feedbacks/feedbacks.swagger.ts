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
  FeedbackRecordEntity,
  FeedbackSectionEntity,
} from './entities/feedback-record.entity';

export const SwaggerListFeedbacks = () =>
  applyDecorators(
    ApiOkResponse({ type: FeedbackSectionEntity }),
    ApiForbiddenResponse({ description: 'Feedback is not accessible' }),
    ApiNotFoundResponse({ description: 'Employee not found' }),
    ApiServiceUnavailableResponse({
      description: 'Feedback provider unavailable',
    }),
  );

export const SwaggerCreateFeedbackRecord = () =>
  applyDecorators(
    ApiCreatedResponse({ type: FeedbackRecordEntity }),
    ApiBadRequestResponse({ description: 'Invalid feedback payload' }),
    ApiForbiddenResponse({ description: 'Viewer lacks S8 write access' }),
    ApiNotFoundResponse({ description: 'Employee not found' }),
  );

export const SwaggerUpdateFeedbackRecord = () =>
  applyDecorators(
    ApiOkResponse({ type: FeedbackRecordEntity }),
    ApiBadRequestResponse({ description: 'Invalid feedback payload' }),
    ApiForbiddenResponse({ description: 'Viewer lacks S8 write access' }),
    ApiNotFoundResponse({ description: 'Feedback record not found' }),
  );

export const SwaggerDeleteFeedbackRecord = () =>
  applyDecorators(
    ApiNoContentResponse({ description: 'Feedback record deleted' }),
    ApiForbiddenResponse({ description: 'Viewer lacks S8 write access' }),
    ApiNotFoundResponse({ description: 'Feedback record not found' }),
  );
