import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { AccessResolver } from '../../contracts/access-resolver.contract';
import { RelationshipJournalService } from '../relationship-journal.service';

describe('RelationshipJournalService', () => {
  let service: RelationshipJournalService;
  let accessResolver: jest.Mocked<AccessResolver>;
  let prisma: {
    relationshipJournalEntry: {
      create: jest.Mock;
      findMany: jest.Mock;
    };
  };

  const subjectId = 'subject-id';
  const readerId = 'reader-id';

  beforeEach(async () => {
    accessResolver = {
      resolveAudience: jest.fn(),
    };

    prisma = {
      relationshipJournalEntry: {
        create: jest.fn().mockResolvedValue({
          id: 'entry-1',
          actorEmployeeId: readerId,
          subjectEmployeeId: subjectId,
          kind: 'shared_link_access',
          before: null,
          after: { sharedLinkId: 'link-1', outcome: 'granted' },
          createdAt: new Date('2026-09-02T12:00:00.000Z'),
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RelationshipJournalService,
        { provide: AccessResolver, useValue: accessResolver },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(RelationshipJournalService);
  });

  it('readFor_allowsReportingLineReader', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'ReportingLine',
      sections: { S1: 'RW' } as never,
    });

    await service.readFor(subjectId, readerId);

    expect(prisma.relationshipJournalEntry.findMany).toHaveBeenCalledWith({
      where: { subjectEmployeeId: subjectId, kind: 'shared_link_access' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('readFor_rejectsColleagueReader', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'Colleague',
      sections: { S1: 'R' } as never,
    });

    await expect(service.readFor(subjectId, readerId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('record_persistsSharedLinkAccessEntry', async () => {
    const entry = await service.record(
      readerId,
      subjectId,
      'shared_link_access',
      null,
      {
        sharedLinkId: 'link-1',
        outcome: 'granted',
        originIp: '127.0.0.1',
        recipientEmployeeId: readerId,
      },
    );

    expect(prisma.relationshipJournalEntry.create).toHaveBeenCalled();
    expect(entry.kind).toBe('shared_link_access');
    expect(entry.createdAt).toBe('2026-09-02T12:00:00.000Z');
  });
});
