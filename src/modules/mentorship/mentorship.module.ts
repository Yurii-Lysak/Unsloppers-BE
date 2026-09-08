import { Global, Module } from '@nestjs/common';
import { ActiveMentorLookup } from '../contracts/active-mentor-lookup.contract';
import { ActiveMentorLookupService } from './active-mentor-lookup.service';
import {
  EmployeeMentorshipController,
  MentorshipPoolController,
} from './mentorship.controller';
import { MentorshipPairService } from './mentorship-pair.service';
import { MentorshipAssignmentService } from './mentorship-assignment.service';
import { MentorshipSectionProvider } from './mentorship-section.provider';
import { MentorshipService } from './mentorship.service';

/**
 * Story 1.7 / 9.1 — mentor lookup for profile assembly, S13 section provider,
 * self-flag writes, willing-mentor pool reads, and pair assignment (Story 9.2).
 */
@Global()
@Module({
  controllers: [EmployeeMentorshipController, MentorshipPoolController],
  providers: [
    { provide: ActiveMentorLookup, useClass: ActiveMentorLookupService },
    MentorshipPairService,
    MentorshipAssignmentService,
    MentorshipService,
    MentorshipSectionProvider,
  ],
  exports: [
    ActiveMentorLookup,
    MentorshipPairService,
    MentorshipAssignmentService,
    MentorshipService,
  ],
})
export class MentorshipModule {}
