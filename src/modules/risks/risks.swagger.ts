import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
} from '@nestjs/swagger';
import {
  RiskRecordReadEntity,
  RisksSectionEntity,
} from './entities/risk-record.entity';

export const SwaggerListRisks = () =>
  applyDecorators(
    ApiOkResponse({ type: RisksSectionEntity }),
    ApiForbiddenResponse({ description: 'Risks are not accessible' }),
    ApiNotFoundResponse({ description: 'Employee not found' }),
    ApiServiceUnavailableResponse({
      description: 'Risks provider unavailable',
    }),
  );

export const SwaggerCreateRiskRecord = () =>
  applyDecorators(
    ApiCreatedResponse({ type: RiskRecordReadEntity }),
    ApiBadRequestResponse({ description: 'Invalid risk payload' }),
    ApiForbiddenResponse({ description: 'Viewer lacks S6 write access' }),
    ApiNotFoundResponse({ description: 'Employee not found' }),
  );
