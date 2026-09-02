import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AccessResolver,
  AccessRole,
} from '../contracts/access-resolver.contract';
import {
  JournalEntry,
  RelationshipJournal,
  RelationshipJournalKind,
} from '../contracts/relationship-journal.contract';

const MANAGE_GATE_ROLES = new Set<AccessRole>([
  'ReportingLine',
  'ProjectLine',
  'PP',
  'FullAccess',
]);

@Injectable()
export class RelationshipJournalService extends RelationshipJournal {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessResolver: AccessResolver,
  ) {
    super();
  }

  async record(
    actorEmployeeId: string | null,
    subjectEmployeeId: string,
    kind: RelationshipJournalKind,
    before: object | null,
    after: object,
  ): Promise<JournalEntry> {
    const row = await this.prisma.relationshipJournalEntry.create({
      data: {
        actorEmployeeId,
        subjectEmployeeId,
        kind,
        before: before === null ? undefined : before,
        after: after,
      },
    });

    return this.toJournalEntry(row);
  }

  async readFor(
    subjectEmployeeId: string,
    readerEmployeeId: string,
  ): Promise<JournalEntry[]> {
    await this.assertCanRead(subjectEmployeeId, readerEmployeeId);

    const rows = await this.prisma.relationshipJournalEntry.findMany({
      where: { subjectEmployeeId, kind: 'shared_link_access' },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => this.toJournalEntry(row));
  }

  async assertCanRead(
    subjectEmployeeId: string,
    readerEmployeeId: string,
  ): Promise<void> {
    const audience = await this.accessResolver.resolveAudience(
      readerEmployeeId,
      subjectEmployeeId,
    );
    if (!MANAGE_GATE_ROLES.has(audience.role)) {
      throw new ForbiddenException(
        'You do not have permission to read the relationship journal for this employee',
      );
    }
  }

  private toJournalEntry(row: {
    id: string;
    actorEmployeeId: string | null;
    subjectEmployeeId: string;
    kind: string;
    before: unknown;
    after: unknown;
    createdAt: Date;
  }): JournalEntry {
    return {
      id: row.id,
      actorEmployeeId: row.actorEmployeeId,
      subjectEmployeeId: row.subjectEmployeeId,
      kind: row.kind as RelationshipJournalKind,
      before: row.before as object | null,
      after: row.after as object,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
