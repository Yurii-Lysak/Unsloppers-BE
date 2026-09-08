import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import {
  MentorshipSectionEntity,
  WillingMentorsListEntity,
} from './entities/mentorship-section.entity';

export const SwaggerPatchOpenToMentoring = () =>
  applyDecorators(
    ApiOkResponse({ type: MentorshipSectionEntity }),
    ApiBadRequestResponse({
      description: 'Invalid payload or forbidden status write',
    }),
    ApiForbiddenResponse({
      description: 'Viewer is not Self or lacks S13 write access',
    }),
    ApiNotFoundResponse({ description: 'Employee not found' }),
  );

export const SwaggerListWillingMentors = () =>
  applyDecorators(
    ApiOkResponse({ type: WillingMentorsListEntity }),
    ApiForbiddenResponse({
      description: 'Viewer lacks assign and end mentorships permission',
    }),
  );
