import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { EmployeeListEntity } from './entities/employee-list.entity';
import { EmployeeSummaryEntity } from './entities/employee-summary.entity';

export const SwaggerListEmployees = () =>
  applyDecorators(
    ApiOkResponse({ type: EmployeeListEntity }),
    ApiBadRequestResponse({
      description: 'Invalid pagination, sort, or filter parameters',
    }),
  );

export const SwaggerGetEmployee = () =>
  applyDecorators(
    ApiOkResponse({ type: EmployeeSummaryEntity }),
    ApiUnauthorizedResponse({ description: 'Unauthenticated' }),
    ApiNotFoundResponse({ description: 'Employee not found' }),
  );
