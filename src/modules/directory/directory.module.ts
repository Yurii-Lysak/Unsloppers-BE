import { Global, Module } from '@nestjs/common';
import { EmployeeDirectory } from '../contracts/employee-directory.contract';
import { FieldRegistry } from '../contracts/field-registry.contract';
import { CustomFieldVisibilityService } from './custom-field-visibility.service';
import { CustomFieldsController } from './custom-fields.controller';
import { CustomFieldsSectionProvider } from './custom-fields-section.provider';
import { EmployeesController } from './employees.controller';
import { CustomFieldsService } from './custom-fields.service';
import { EmployeesService } from './employees.service';
import { FieldRegistryService } from './field-registry.service';
import { SavedViewsController } from './saved-views.controller';
import { SavedViewsService } from './saved-views.service';

/**
 * `directory` — C2 FieldRegistry real implementation (Story 3.2).
 * @Global() so `{ provide: FieldRegistry, useExisting: FieldRegistryService }`
 * overrides the Wave-0 stub from ContractsModule for the whole app.
 */
@Global()
@Module({
  controllers: [CustomFieldsController, EmployeesController, SavedViewsController],
  providers: [
    FieldRegistryService,
    CustomFieldsService,
    EmployeesService,
    SavedViewsService,
    CustomFieldVisibilityService,
    CustomFieldsSectionProvider,
    {
      provide: FieldRegistry,
      useExisting: FieldRegistryService,
    },
    {
      provide: EmployeeDirectory,
      useExisting: EmployeesService,
    },
  ],
  exports: [
    FieldRegistry,
    FieldRegistryService,
    EmployeeDirectory,
    CustomFieldsService,
    EmployeesService,
    SavedViewsService,
  ],
})
export class DirectoryModule {}
