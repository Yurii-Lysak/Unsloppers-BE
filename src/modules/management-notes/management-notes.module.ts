import { Module } from '@nestjs/common';
import { ManagementNotesController } from './management-notes.controller';
import { ManagementNotesSectionProvider } from './management-notes-section.provider';
import { ManagementNotesService } from './management-notes.service';

@Module({
  controllers: [ManagementNotesController],
  providers: [ManagementNotesService, ManagementNotesSectionProvider],
  exports: [ManagementNotesService],
})
export class ManagementNotesModule {}
