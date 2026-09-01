import { applyDecorators } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { EmployeeSummaryEntity } from './entities/employee-summary.entity';

export const SwaggerListEmployees = () =>
  applyDecorators(
    ApiOkResponse({ type: EmployeeSummaryEntity, isArray: true }),
    ApiUnauthorizedResponse({ description: 'Unauthenticated' }),
  );

export const SwaggerGetEmployee = () =>
  applyDecorators(
    ApiOkResponse({ type: EmployeeSummaryEntity }),
    ApiUnauthorizedResponse({ description: 'Unauthenticated' }),
    ApiNotFoundResponse({ description: 'Employee not found' }),
  );
