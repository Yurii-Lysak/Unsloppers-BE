import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { EmployeeFieldUpdateEntity } from './entities/employee-field-update.entity';
import { EmployeeListEntity } from './entities/employee-list.entity';
import { EmployeeLookupEntity } from './entities/employee-lookup.entity';
import { EmployeeSummaryEntity } from './entities/employee-summary.entity';

export const SwaggerListEmployees = () =>
  applyDecorators(
    ApiOkResponse({ type: EmployeeListEntity }),
    ApiBadRequestResponse({
      description: 'Invalid pagination, sort, or filter parameters',
    }),
  );

export const SwaggerLookupEmployees = () =>
  applyDecorators(
    ApiOkResponse({ type: EmployeeLookupEntity, isArray: true }),
    ApiUnauthorizedResponse({ description: 'Unauthenticated' }),
  );

export const SwaggerGetEmployee = () =>
  applyDecorators(
    ApiOkResponse({ type: EmployeeSummaryEntity }),
    ApiUnauthorizedResponse({ description: 'Unauthenticated' }),
    ApiNotFoundResponse({ description: 'Employee not found' }),
  );

export const SwaggerUpdateEmployeeField = () =>
  applyDecorators(
    ApiOkResponse({ type: EmployeeFieldUpdateEntity }),
    ApiBadRequestResponse({ description: 'Invalid field or value' }),
    ApiForbiddenResponse({ description: 'Write not permitted for this field' }),
    ApiNotFoundResponse({ description: 'Employee or field not found' }),
    ApiUnauthorizedResponse({ description: 'Unauthenticated' }),
  );
