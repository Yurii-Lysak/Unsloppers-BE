import { applyDecorators } from '@nestjs/common';
import { ApiForbiddenResponse, ApiOkResponse } from '@nestjs/swagger';
import {
  RiskDashboardAccessEntity,
  RiskDashboardEntity,
} from './entities/risk-dashboard.entity';

export const SwaggerRiskDashboardAccess = () =>
  applyDecorators(
    ApiOkResponse({ type: RiskDashboardAccessEntity }),
    ApiForbiddenResponse({ description: 'Authenticated user has no employee' }),
  );

export const SwaggerRiskDashboard = () =>
  applyDecorators(
    ApiOkResponse({ type: RiskDashboardEntity }),
    ApiForbiddenResponse({ description: 'Risk dashboard is not accessible' }),
  );
