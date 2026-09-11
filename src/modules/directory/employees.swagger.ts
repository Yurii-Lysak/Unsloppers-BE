import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { EmployeeFieldUpdateEntity } from './entities/employee-field-update.entity';
import { EmployeeLeaveCellEntity } from './entities/employee-leave-cell.entity';
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

export const SwaggerExportEmployees = () =>
  applyDecorators(
    ApiOkResponse({
      description:
        'Excel workbook (.xlsx) of the access-resolved employee list',
      schema: { type: 'string', format: 'binary' },
    }),
    ApiBadRequestResponse({
      description: 'Invalid filters, sort, or columns parameters',
    }),
    ApiUnauthorizedResponse({ description: 'Unauthenticated' }),
  );

export const SwaggerGetEmployeeLeaveCells = () =>
  applyDecorators(
    ApiExtraModels(EmployeeLeaveCellEntity),
    ApiOkResponse({
      description:
        'Leave-column data for the given employee ids, keyed by employeeId. ' +
        'An id is omitted when the viewer has no S10 access to that employee.',
      schema: {
        type: 'object',
        additionalProperties: { $ref: getSchemaPath(EmployeeLeaveCellEntity) },
      },
    }),
    ApiBadRequestResponse({ description: 'Invalid employeeIds parameter' }),
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
