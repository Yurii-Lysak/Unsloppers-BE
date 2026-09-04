import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { CampaignReadEntity } from './entities/campaign.entity';

export const SwaggerCreateCampaign = () =>
  applyDecorators(
    ApiCreatedResponse({ type: CampaignReadEntity }),
    ApiBadRequestResponse({ description: 'Invalid campaign payload' }),
    ApiForbiddenResponse({
      description: 'Viewer lacks create_form_campaigns permission',
    }),
  );

const AUTHENTICATED_USER_HAS_NO_EMPLOYEE_RECORD =
  'Authenticated user has no employee record';

export const SwaggerListCampaigns = () =>
  applyDecorators(
    ApiOkResponse({ type: [CampaignReadEntity] }),
    ApiForbiddenResponse({
      description: AUTHENTICATED_USER_HAS_NO_EMPLOYEE_RECORD,
    }),
  );

export const SwaggerGetCampaign = () =>
  applyDecorators(
    ApiOkResponse({ type: CampaignReadEntity }),
    ApiForbiddenResponse({
      description: AUTHENTICATED_USER_HAS_NO_EMPLOYEE_RECORD,
    }),
    ApiNotFoundResponse({ description: 'Campaign not found' }),
  );

export const SwaggerUpdateCampaign = () =>
  applyDecorators(
    ApiOkResponse({ type: CampaignReadEntity }),
    ApiBadRequestResponse({ description: 'Invalid campaign payload' }),
    ApiForbiddenResponse({
      description: AUTHENTICATED_USER_HAS_NO_EMPLOYEE_RECORD,
    }),
    ApiNotFoundResponse({ description: 'Campaign not found' }),
    ApiConflictResponse({ description: 'Campaign is not in draft state' }),
  );
