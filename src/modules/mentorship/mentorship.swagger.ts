import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import {
  ActiveMentorshipPairsListEntity,
  AssignableMenteesListEntity,
  CreatedMentorshipPairEntity,
  EndedMentorshipPairEntity,
} from './entities/mentorship-pair.entity';
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

export const SwaggerListAssignableMentees = () =>
  applyDecorators(
    ApiOkResponse({ type: AssignableMenteesListEntity }),
    ApiForbiddenResponse({
      description: 'Viewer lacks assign and end mentorships permission',
    }),
  );

export const SwaggerCreateMentorshipPair = () =>
  applyDecorators(
    ApiOkResponse({ type: CreatedMentorshipPairEntity }),
    ApiBadRequestResponse({
      description:
        'Invalid payload, self-pair, duplicate active mentee, or mentor not open to mentoring',
    }),
    ApiForbiddenResponse({
      description: 'Viewer lacks permission or mentee is outside access scope',
    }),
    ApiNotFoundResponse({ description: 'Mentor not found' }),
  );

export const SwaggerListActiveMentorshipPairs = () =>
  applyDecorators(
    ApiOkResponse({ type: ActiveMentorshipPairsListEntity }),
    ApiBadRequestResponse({ description: 'Unsupported status query value' }),
    ApiForbiddenResponse({
      description: 'Viewer lacks assign and end mentorships permission',
    }),
  );

export const SwaggerEndMentorshipPair = () =>
  applyDecorators(
    ApiOkResponse({ type: EndedMentorshipPairEntity }),
    ApiBadRequestResponse({
      description: 'Missing or empty closing feedback',
    }),
    ApiForbiddenResponse({
      description: 'Viewer lacks permission or pair is outside access scope',
    }),
    ApiNotFoundResponse({ description: 'Mentorship pair not found' }),
    ApiConflictResponse({
      description: 'Mentorship pair has already ended',
    }),
  );
