import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { ResourcingRequestReadEntity } from './entities/resourcing-request.entity';

const VIEWER_LACKS_CREATE_RESOURCING_REQUESTS =
  'Viewer lacks create_resourcing_requests permission';

const AUTHENTICATED_USER_HAS_NO_EMPLOYEE_RECORD =
  'Authenticated user has no employee record';

export const SwaggerCreateResourcingRequest = () =>
  applyDecorators(
    ApiCreatedResponse({ type: ResourcingRequestReadEntity }),
    ApiBadRequestResponse({
      description: 'Invalid resourcing request payload',
    }),
    ApiForbiddenResponse({
      description: VIEWER_LACKS_CREATE_RESOURCING_REQUESTS,
    }),
  );

export const SwaggerListResourcingRequests = () =>
  applyDecorators(
    ApiOkResponse({ type: [ResourcingRequestReadEntity] }),
    ApiForbiddenResponse({
      description: `${VIEWER_LACKS_CREATE_RESOURCING_REQUESTS} or ${AUTHENTICATED_USER_HAS_NO_EMPLOYEE_RECORD}`,
    }),
  );
