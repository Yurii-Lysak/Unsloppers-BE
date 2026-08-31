import { Global, Module } from '@nestjs/common';
import { FieldRegistry } from '../contracts/field-registry.contract';
import { CustomFieldVisibilityService } from './custom-field-visibility.service';
import { CustomFieldsController } from './custom-fields.controller';
import { CustomFieldsService } from './custom-fields.service';
import { FieldRegistryService } from './field-registry.service';

/**
 * `directory` — C2 FieldRegistry real implementation (Story 3.2).
 * @Global() so `{ provide: FieldRegistry, useExisting: FieldRegistryService }`
 * overrides the Wave-0 stub from ContractsModule for the whole app.
 */
@Global()
@Module({
  controllers: [CustomFieldsController],
  providers: [
    FieldRegistryService,
    CustomFieldsService,
    CustomFieldVisibilityService,
    {
      provide: FieldRegistry,
      useExisting: FieldRegistryService,
    },
  ],
  exports: [FieldRegistry, FieldRegistryService, CustomFieldsService],
})
export class DirectoryModule {}
