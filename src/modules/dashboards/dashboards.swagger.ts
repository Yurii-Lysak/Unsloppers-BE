import { applyDecorators } from '@nestjs/common';
import { ApiForbiddenResponse, ApiOkResponse } from '@nestjs/swagger';
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
    ApiForbiddenResponse({ description: 'Viewer has no dashboard variant' }),
  );
