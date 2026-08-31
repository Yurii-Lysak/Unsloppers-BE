import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { CustomFieldDefinitionEntity } from './entities/custom-field-definition.entity';
import { CustomFieldValueEntity } from './entities/custom-field-value.entity';

export const SwaggerCreateCustomField = () =>
  applyDecorators(
    ApiCreatedResponse({ type: CustomFieldDefinitionEntity }),
    ApiBadRequestResponse({ description: 'Invalid field definition payload' }),
    ApiForbiddenResponse({
      description: 'Missing manage custom fields permission',
    }),
  );

export const SwaggerListCustomFields = () =>
  applyDecorators(
    ApiOkResponse({ type: CustomFieldDefinitionEntity, isArray: true }),
  );

export const SwaggerGetCustomField = () =>
  applyDecorators(
    ApiOkResponse({ type: CustomFieldDefinitionEntity }),
    ApiNotFoundResponse({ description: 'Custom field not found' }),
    ApiForbiddenResponse({ description: 'Custom field not visible' }),
  );

export const SwaggerSetCustomFieldValue = () =>
  applyDecorators(
    ApiOkResponse({ type: CustomFieldValueEntity }),
    ApiBadRequestResponse({ description: 'Invalid value payload' }),
    ApiNotFoundResponse({ description: 'Employee or field not found' }),
    ApiForbiddenResponse({ description: 'Write not permitted' }),
  );

export const SwaggerListCustomFieldValues = () =>
  applyDecorators(
    ApiOkResponse({ type: CustomFieldValueEntity, isArray: true }),
    ApiNotFoundResponse({ description: 'Employee not found' }),
  );
