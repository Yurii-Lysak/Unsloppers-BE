/**
 * Story 1.7 — read-only active mentor resolution for S1 profile assembly.
 * Epic 9's `mentorship` module owns pair lifecycle writes; consumers inject
 * this contract only.
 */

export interface ActiveMentorDto {
  id: string;
  displayName: string;
}

export abstract class ActiveMentorLookup {
  abstract getActiveMentorForMentee(
    menteeId: string,
  ): Promise<ActiveMentorDto | null>;
}
