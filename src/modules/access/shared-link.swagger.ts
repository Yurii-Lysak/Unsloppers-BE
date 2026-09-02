import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  CreateSharedLinkResponseDto,
  ListSharedLinksResponseDto,
  RevokeSharedLinkResponseDto,
  SharedLinkAccessLogResponseDto,
} from './dto/create-shared-link.dto';

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
        'Invalid recipient, forbidden section, duplicate section ids, invalid expiresInHours, or creator lacks grant for a requested section',
    }),
  );

export const SwaggerListSharedLinks = () =>
  applyDecorators(
    ApiOkResponse({ type: ListSharedLinksResponseDto }),
    ApiUnauthorizedResponse({ description: 'Unauthenticated' }),
    ApiForbiddenResponse({
      description:
        'Authenticated user has no employee record, or lacks manage access over the subject',
    }),
    ApiNotFoundResponse({ description: 'Subject employee not found' }),
  );

export const SwaggerRevokeSharedLink = () =>
  applyDecorators(
    ApiOkResponse({ type: RevokeSharedLinkResponseDto }),
    ApiUnauthorizedResponse({ description: 'Unauthenticated' }),
    ApiForbiddenResponse({
      description:
        'Authenticated user has no employee record, or lacks manage access over the subject',
    }),
    ApiNotFoundResponse({
      description: 'Subject employee or shared link not found',
    }),
  );

export const SwaggerGetSharedLinkAccessLog = () =>
  applyDecorators(
    ApiOkResponse({ type: SharedLinkAccessLogResponseDto }),
    ApiUnauthorizedResponse({ description: 'Unauthenticated' }),
    ApiForbiddenResponse({
      description:
        'Authenticated user has no employee record, or lacks manage access over the subject',
    }),
    ApiNotFoundResponse({
      description: 'Subject employee or shared link not found',
    }),
  );
