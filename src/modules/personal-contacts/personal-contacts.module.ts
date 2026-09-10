import { Module } from '@nestjs/common';
import { EmergencyContactsController } from './emergency-contacts.controller';
import { EmergencyContactsSectionProvider } from './emergency-contacts-section.provider';
import { PersonalContactsController } from './personal-contacts.controller';
import { PersonalContactsSectionProvider } from './personal-contacts-section.provider';
import { PersonalContactsService } from './personal-contacts.service';

@Module({
  controllers: [PersonalContactsController, EmergencyContactsController],
  providers: [
    PersonalContactsService,
    PersonalContactsSectionProvider,
    EmergencyContactsSectionProvider,
  ],
  exports: [PersonalContactsService],
})
export class PersonalContactsModule {}
