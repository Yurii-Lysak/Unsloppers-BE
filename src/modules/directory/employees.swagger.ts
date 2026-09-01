import { applyDecorators } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOkResponse } from '@nestjs/swagger';
import { EmployeeListEntity } from './entities/employee-list.entity';

export const SwaggerListEmployees = () =>
  applyDecorators(
    ApiOkResponse({ type: EmployeeListEntity }),
    ApiBadRequestResponse({
      description: 'Invalid pagination, sort, or filter parameters',
    }),
  );
