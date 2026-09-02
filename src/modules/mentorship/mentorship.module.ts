import { Global, Module } from '@nestjs/common';
import { ActiveMentorLookup } from '../contracts/active-mentor-lookup.contract';
import { ActiveMentorLookupService } from './active-mentor-lookup.service';
import { MentorshipPairService } from './mentorship-pair.service';

/**
 * Story 1.7 — Epic 9 domain boundary. Read-only mentor lookup for profile
 * assembly; internal pair helpers for tests/seeds only.
 */
@Global()
@Module({
  providers: [
    { provide: ActiveMentorLookup, useClass: ActiveMentorLookupService },
    MentorshipPairService,
  ],
  exports: [ActiveMentorLookup, MentorshipPairService],
})
export class MentorshipModule {}
