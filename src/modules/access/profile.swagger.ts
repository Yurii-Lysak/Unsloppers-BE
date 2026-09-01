import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { EmployeeProfileEntity } from './entities/employee-profile.entity';

export const SwaggerGetEmployeeProfile = () =>
  applyDecorators(
    ApiOkResponse({ type: EmployeeProfileEntity }),
    ApiUnauthorizedResponse({ description: 'Unauthenticated' }),
    ApiForbiddenResponse({
      description: 'Authenticated user has no employee record',
    }),
    ApiNotFoundResponse({ description: 'Employee not found' }),
    ApiBadRequestResponse({ description: 'Malformed employee UUID' }),
  );
