/**
 * C10 — RelationshipJournal
 *
 * Narrow dedicated log for relationship and access-changing events.
 * Owner (real implementation): `access` module.
 */

export type RelationshipJournalKind =
  | 'manager'
  | 'people_partner'
  | 'department'
  | 'department_manager'
  | 'full_access_grant'
  | 'full_access_revoke'
  | 'shared_link_access';

export interface JournalEntry {
  id: string;
  actorEmployeeId: string | null;
  subjectEmployeeId: string;
  kind: RelationshipJournalKind;
  before: object | null;
  after: object;
  createdAt: string;
}

export interface SharedLinkAccessJournalAfter {
  sharedLinkId: string;
  outcome: 'granted' | 'denied';
  denialReason?: 'expired' | 'revoked' | 'wrong_recipient';
  originIp: string | null;
  recipientEmployeeId: string | null;
}

export abstract class RelationshipJournal {
  abstract record(
    actorEmployeeId: string | null,
    subjectEmployeeId: string,
    kind: RelationshipJournalKind,
    before: object | null,
    after: object,
  ): Promise<JournalEntry>;

  abstract readFor(
    subjectEmployeeId: string,
    readerEmployeeId: string,
  ): Promise<JournalEntry[]>;
}
