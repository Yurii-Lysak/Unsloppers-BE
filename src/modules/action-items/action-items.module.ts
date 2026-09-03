import { Global, Module } from '@nestjs/common';
import { ActionItemCreation } from '../contracts/action-item-creation.contract';
import { ActionItemsController } from './action-items.controller';
import { ActionItemsSectionProvider } from './action-items-section.provider';
import { ActionItemsService } from './action-items.service';

/**
 * `action-items` — implements C6 `ActionItemCreation` (Story 4.1) and S14
 * SectionProvider. @Global() so `campaigns` can inject C6 without importing
 * this module explicitly once Epic 10 lands.
 */
@Global()
@Module({
  controllers: [ActionItemsController],
  providers: [
    ActionItemsService,
    ActionItemsSectionProvider,
    { provide: ActionItemCreation, useExisting: ActionItemsService },
  ],
  exports: [ActionItemCreation, ActionItemsService],
})
export class ActionItemsModule {}
