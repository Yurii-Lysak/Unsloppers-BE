import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { ResourcingRequestReadEntity } from './entities/resourcing-request.entity';
import { ResourcingRequestDetailEntity } from './entities/resourcing-request-detail.entity';
import { ResourcingProposalEntity } from './entities/resourcing-proposal.entity';

const VIEWER_LACKS_CREATE_RESOURCING_REQUESTS =
  'Viewer lacks create_resourcing_requests permission';

const VIEWER_LACKS_FULFIL_RESOURCING_REQUESTS =
  'Viewer lacks fulfil_resourcing_requests permission';

const VIEWER_NOT_ROUTED_UM =
  'Viewer is not the current routed Unit Manager for this request';

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

export const SwaggerListAssignedResourcingRequests = () =>
  applyDecorators(
    ApiOkResponse({ type: [ResourcingRequestReadEntity] }),
    ApiForbiddenResponse({
      description: `${VIEWER_LACKS_FULFIL_RESOURCING_REQUESTS} or ${AUTHENTICATED_USER_HAS_NO_EMPLOYEE_RECORD}`,
    }),
  );

export const SwaggerGetResourcingRequestDetail = () =>
  applyDecorators(
    ApiOkResponse({ type: ResourcingRequestDetailEntity }),
    ApiForbiddenResponse({
      description: `${VIEWER_LACKS_FULFIL_RESOURCING_REQUESTS}, ${AUTHENTICATED_USER_HAS_NO_EMPLOYEE_RECORD}, or ${VIEWER_NOT_ROUTED_UM}`,
    }),
    ApiNotFoundResponse({ description: 'Resourcing request not found' }),
  );

export const SwaggerCreateResourcingProposal = () =>
  applyDecorators(
    ApiCreatedResponse({ type: ResourcingProposalEntity }),
    ApiBadRequestResponse({
      description:
        'Invalid proposal payload — exactly one of an internal candidate or ' +
        'an external PeopleForce link is required, and internal candidates ' +
        'must belong to the managed unit',
    }),
    ApiForbiddenResponse({
      description: `${VIEWER_LACKS_FULFIL_RESOURCING_REQUESTS}, ${AUTHENTICATED_USER_HAS_NO_EMPLOYEE_RECORD}, or ${VIEWER_NOT_ROUTED_UM}`,
    }),
    ApiNotFoundResponse({ description: 'Resourcing request not found' }),
    ApiConflictResponse({
      description: 'Resourcing request is not open for new proposals',
    }),
  );

export const SwaggerSubmitResourcingRequest = () =>
  applyDecorators(
    ApiOkResponse({ type: ResourcingRequestDetailEntity }),
    ApiBadRequestResponse({
      description: 'Attach at least one candidate before submitting',
    }),
    ApiForbiddenResponse({
      description: `${VIEWER_LACKS_FULFIL_RESOURCING_REQUESTS}, ${AUTHENTICATED_USER_HAS_NO_EMPLOYEE_RECORD}, or ${VIEWER_NOT_ROUTED_UM}`,
    }),
    ApiNotFoundResponse({ description: 'Resourcing request not found' }),
    ApiConflictResponse({
      description:
        'Resourcing request is not open — it may already be submitted',
    }),
  );
