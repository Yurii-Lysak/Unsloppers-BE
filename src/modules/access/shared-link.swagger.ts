import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CreateSharedLinkResponseDto } from './dto/create-shared-link.dto';

export const SwaggerCreateSharedLink = () =>
  applyDecorators(
    ApiCreatedResponse({ type: CreateSharedLinkResponseDto }),
    ApiUnauthorizedResponse({ description: 'Unauthenticated' }),
    ApiForbiddenResponse({
      description:
        'Authenticated user has no employee record, or lacks Reporting-line/Project-line/PP access over the subject',
    }),
    ApiNotFoundResponse({ description: 'Subject employee not found' }),
    ApiBadRequestResponse({
      description:
        'Invalid recipient, forbidden section, duplicate section ids, or creator lacks grant for a requested section. Note: expiresAt is stored (default 24h) but not enforced until Story 1.12.',
    }),
  );
