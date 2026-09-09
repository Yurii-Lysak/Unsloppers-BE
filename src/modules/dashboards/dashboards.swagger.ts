import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { DashboardConfigEntity } from './entities/dashboard-config.entity';
import { DashboardSummaryEntity } from './entities/dashboard-summary.entity';

export const SwaggerGetDashboardConfig = () =>
  applyDecorators(
    ApiOkResponse({ type: DashboardConfigEntity }),
    ApiForbiddenResponse({ description: 'Viewer has no dashboard variant' }),
  );

export const SwaggerGetDashboardSummary = () =>
  applyDecorators(
    ApiOkResponse({ type: DashboardSummaryEntity }),
    ApiBadRequestResponse({
      description:
        'Invalid pagination or projectId query parameters',
    }),
    ApiForbiddenResponse({ description: 'Viewer has no dashboard variant' }),
  );
