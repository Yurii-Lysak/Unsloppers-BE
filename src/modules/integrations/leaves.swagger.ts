import { applyDecorators } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { SESSION_COOKIE_NAME } from '../contracts/session-auth.constants';
import { LeavesSectionEntity } from './entities/leaves-section.entity';

export const SwaggerGetEmployeeLeaves = (): MethodDecorator =>
  applyDecorators(
    ApiCookieAuth(SESSION_COOKIE_NAME),
    ApiOperation({
      summary: 'Get S10 leave periods for an employee',
      description:
        'Story 13.1 dev/test surface until ProfileAssembler (Story 1.6) wires section providers.',
    }),
    ApiParam({ name: 'employeeId', format: 'uuid' }),
    ApiOkResponse({ type: LeavesSectionEntity }),
    ApiForbiddenResponse({
      description: 'Viewer cannot access S10 for subject',
    }),
    ApiNotFoundResponse({ description: 'Employee not found' }),
  );
