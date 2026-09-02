import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Clock } from '../../../clock/clock.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AccessResolver } from '../../contracts/access-resolver.contract';
import { RelationshipJournal } from '../../contracts/relationship-journal.contract';
import { SharedLinkService } from '../shared-link.service';

describe('SharedLinkService', () => {
  let service: SharedLinkService;
  let accessResolver: jest.Mocked<AccessResolver>;
  let relationshipJournal: { record: jest.Mock };
  let prisma: {
    sharedLink: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    employee: { findUnique: jest.Mock };
  };
  let clock: { now: jest.Mock; nowMs: jest.Mock };

  const creatorId = 'creator-id';
  const subjectId = 'subject-id';
  const recipientId = 'recipient-id';
  const baseTime = new Date('2026-09-02T12:00:00.000Z');

  const activeLinkRow = {
    id: 'link-id',
    token: 'A'.repeat(43),
    subjectEmployeeId: subjectId,
    creatorEmployeeId: creatorId,
    recipientEmployeeId: recipientId,
    expiresAt: new Date('2026-09-03T12:00:00.000Z'),
    revokedAt: null,
    createdAt: baseTime,
    sections: [{ sectionId: 'S1' }, { sectionId: 'S9' }],
  };

  beforeEach(async () => {
    accessResolver = {
      resolveAudience: jest.fn(),
    };

    relationshipJournal = {
      record: jest.fn().mockResolvedValue({}),
    };

    prisma = {
      sharedLink: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      employee: {
        findUnique: jest.fn(),
      },
    };

    clock = {
      now: jest.fn().mockReturnValue(baseTime),
      nowMs: jest.fn().mockReturnValue(baseTime.getTime()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SharedLinkService,
        { provide: AccessResolver, useValue: accessResolver },
        { provide: RelationshipJournal, useValue: relationshipJournal },
        { provide: PrismaService, useValue: prisma },
        { provide: Clock, useValue: clock },
      ],
    }).compile();

    service = module.get(SharedLinkService);
  });

  const reportingLineAudience = () => ({
    role: 'ReportingLine' as const,
    sections: {
      S1: 'RW',
      S2: 'R',
      S3: 'R',
      S4: 'RW',
      S5: 'R',
      S6: 'RW',
      S7: 'RW',
      S8: 'RW',
      S9: 'RW',
      S10: 'R',
      S11: 'R',
      S12: 'RW',
      S13: 'RW',
      S14: 'RW',
      S15: 'R',
      S16: 'RW',
    },
  });

  const linkRecord = () => ({
    id: activeLinkRow.id,
    token: activeLinkRow.token,
    subjectEmployeeId: subjectId,
    creatorEmployeeId: creatorId,
    recipientEmployeeId: recipientId,
    sectionIds: ['S1', 'S9'] as const,
    expiresAt: activeLinkRow.expiresAt,
    revokedAt: null,
  });

  const setupCreateFixtures = () => {
    prisma.employee.findUnique.mockImplementation(
      ({ where }: { where: { id?: string } }) => {
        if (where.id === subjectId) {
          return Promise.resolve({ id: subjectId });
        }
        if (where.id === recipientId) {
          return Promise.resolve({
            id: recipientId,
            employmentStatus: 'active',
            user: { id: 'user-recipient' },
          });
        }
        return Promise.resolve(null);
      },
    );
    accessResolver.resolveAudience.mockResolvedValue(reportingLineAudience());
  };

  it('createLink_rejectsNeverSections', async () => {
    setupCreateFixtures();
    await expect(
      service.createLink(creatorId, subjectId, {
        recipientEmployeeId: recipientId,
        sections: ['S7'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('createLink_rejectsS14', async () => {
    setupCreateFixtures();
    await expect(
      service.createLink(creatorId, subjectId, {
        recipientEmployeeId: recipientId,
        sections: ['S14'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('createLink_rejectsDuplicateSectionIds', async () => {
    setupCreateFixtures();
    await expect(
      service.createLink(creatorId, subjectId, {
        recipientEmployeeId: recipientId,
        sections: ['S9', 'S9'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('createLink_rejectsColleagueCreatorRole', async () => {
    setupCreateFixtures();
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'Colleague',
      sections: reportingLineAudience().sections,
    });
    await expect(
      service.createLink(creatorId, subjectId, {
        recipientEmployeeId: recipientId,
        sections: ['S9'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('createLink_rejectsFullAccessOnlyCreator', async () => {
    setupCreateFixtures();
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'FullAccess',
      sections: reportingLineAudience().sections,
    });
    await expect(
      service.createLink(creatorId, subjectId, {
        recipientEmployeeId: recipientId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('createLink_rejectsSectionCreatorCannotGrant', async () => {
    setupCreateFixtures();
    const audience = reportingLineAudience();
    audience.sections.S6 = 'none';
    accessResolver.resolveAudience.mockResolvedValue(audience);
    await expect(
      service.createLink(creatorId, subjectId, {
        recipientEmployeeId: recipientId,
        sections: ['S6'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('createLink_usesCustomExpiresInHours', async () => {
    setupCreateFixtures();
    await service.createLink(creatorId, subjectId, {
      recipientEmployeeId: recipientId,
      expiresInHours: 48,
    });

    expect(prisma.sharedLink.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          expiresAt: new Date(baseTime.getTime() + 48 * 3_600_000),
        }) as object,
      }),
    );
  });

  it('buildSharedLinkAudience_capsAllGrantsAtRead', () => {
    const audience = service.buildSharedLinkAudience(['S1', 'S9']);
    expect(audience.role).toBe('SharedLink');
    expect(audience.sections.S1).toBe('R');
    expect(audience.sections.S9).toBe('R');
    expect(audience.sections.S2).toBe('none');
  });

  it('computeClampedSectionIds_appliesD14ReClamp', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'ReportingLine',
      sections: { ...reportingLineAudience().sections, S6: 'none' },
    });
    const clamped = await service.computeClampedSectionIds({
      ...linkRecord(),
      sectionIds: ['S1', 'S6', 'S9'],
    });
    expect(clamped).toEqual(['S1', 'S9']);
  });

  it('findLinkByToken_returns404ForUnknownToken', async () => {
    prisma.sharedLink.findUnique.mockResolvedValue(null);
    await expect(
      service.findLinkByToken('A'.repeat(43)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('findLinkByToken_rejectsMalformedToken', async () => {
    await expect(service.findLinkByToken('short')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('getLifecycleDenial_returnsExpiredAtBoundary', () => {
    const link = {
      ...linkRecord(),
      expiresAt: baseTime,
      revokedAt: null,
    };
    expect(service.getLifecycleDenial(link)).toBe('expired');
  });

  it('getLifecycleDenial_returnsRevoked', () => {
    const link = {
      ...linkRecord(),
      revokedAt: baseTime,
    };
    expect(service.getLifecycleDenial(link)).toBe('revoked');
  });

  it('getLifecycleDenial_returnsNullForActiveLink', () => {
    expect(service.getLifecycleDenial(linkRecord())).toBeNull();
  });

  it('recordAccessAttempt_writesJournalEntry', async () => {
    await service.recordAccessAttempt(
      linkRecord(),
      recipientId,
      '10.0.0.1',
      'granted',
    );

    expect(relationshipJournal.record).toHaveBeenCalledWith(
      recipientId,
      subjectId,
      'shared_link_access',
      null,
      expect.objectContaining({
        sharedLinkId: 'link-id',
        outcome: 'granted',
        originIp: '10.0.0.1',
      }),
    );
  });

  it('revokeLink_isIdempotent', async () => {
    prisma.employee.findUnique.mockResolvedValue({ id: subjectId });
    accessResolver.resolveAudience.mockResolvedValue(reportingLineAudience());
    prisma.sharedLink.findFirst.mockResolvedValue({
      id: 'link-id',
      revokedAt: baseTime,
    });

    const result = await service.revokeLink(creatorId, subjectId, 'link-id');
    expect(result).toEqual({ revoked: true });
    expect(prisma.sharedLink.update).not.toHaveBeenCalled();
  });

  it('revokeLink_setsRevokedAtForActiveLink', async () => {
    prisma.employee.findUnique.mockResolvedValue({ id: subjectId });
    accessResolver.resolveAudience.mockResolvedValue(reportingLineAudience());
    prisma.sharedLink.findFirst.mockResolvedValue({
      id: 'link-id',
      revokedAt: null,
    });

    await service.revokeLink(creatorId, subjectId, 'link-id');

    expect(prisma.sharedLink.update).toHaveBeenCalledWith({
      where: { id: 'link-id' },
      data: { revokedAt: baseTime },
    });
  });

  it('listActiveForSubject_rejectsColleague', async () => {
    prisma.employee.findUnique.mockResolvedValue({ id: subjectId });
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'Colleague',
      sections: reportingLineAudience().sections,
    });

    await expect(
      service.listActiveForSubject('viewer-id', subjectId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('listActiveForSubject_queriesOnlyActiveLinks', async () => {
    prisma.employee.findUnique.mockResolvedValue({ id: subjectId });
    accessResolver.resolveAudience.mockResolvedValue(reportingLineAudience());
    prisma.sharedLink.findMany.mockResolvedValue([]);

    await service.listActiveForSubject(creatorId, subjectId);

    expect(prisma.sharedLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          subjectEmployeeId: subjectId,
          revokedAt: null,
          expiresAt: { gt: baseTime },
        },
      }),
    );
  });

  it('getAccessLog_filtersEntriesBySharedLinkId', async () => {
    prisma.employee.findUnique.mockResolvedValue({ id: subjectId });
    accessResolver.resolveAudience.mockResolvedValue(reportingLineAudience());
    prisma.sharedLink.findFirst.mockResolvedValue({ id: 'link-a' });
    relationshipJournal.record.mockReset();
    const journal = {
      readFor: jest.fn().mockResolvedValue([
        {
          createdAt: '2026-09-02T12:00:00.000Z',
          after: {
            sharedLinkId: 'link-a',
            outcome: 'granted',
            originIp: '10.0.0.1',
            recipientEmployeeId: recipientId,
          },
        },
        {
          createdAt: '2026-09-02T11:00:00.000Z',
          after: {
            sharedLinkId: 'link-b',
            outcome: 'denied',
            denialReason: 'expired',
            originIp: null,
            recipientEmployeeId: recipientId,
          },
        },
      ]),
    };
    const moduleWithJournal = await Test.createTestingModule({
      providers: [
        SharedLinkService,
        { provide: AccessResolver, useValue: accessResolver },
        { provide: RelationshipJournal, useValue: journal },
        { provide: PrismaService, useValue: prisma },
        { provide: Clock, useValue: clock },
      ],
    }).compile();
    const scopedService = moduleWithJournal.get(SharedLinkService);

    const entries = await scopedService.getAccessLog(
      creatorId,
      subjectId,
      'link-a',
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual(
      expect.objectContaining({
        outcome: 'granted',
        originIp: '10.0.0.1',
      }),
    );
  });

  it('createLink_rejectsSelfAsSubject', async () => {
    await expect(
      service.createLink(creatorId, creatorId, {
        recipientEmployeeId: recipientId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('createLink_rejectsSelfAsRecipient', async () => {
    await expect(
      service.createLink(creatorId, subjectId, {
        recipientEmployeeId: creatorId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('createLink_rejectsUnknownRecipient', async () => {
    setupCreateFixtures();
    prisma.employee.findUnique.mockImplementation(
      ({ where }: { where: { id?: string } }) => {
        if (where.id === subjectId) {
          return Promise.resolve({ id: subjectId });
        }
        return Promise.resolve(null);
      },
    );
    await expect(
      service.createLink(creatorId, subjectId, {
        recipientEmployeeId: 'unknown-recipient',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('createLink_rejectsRecipientWithoutUser', async () => {
    setupCreateFixtures();
    prisma.employee.findUnique.mockImplementation(
      ({ where }: { where: { id?: string } }) => {
        if (where.id === subjectId) {
          return Promise.resolve({ id: subjectId });
        }
        if (where.id === recipientId) {
          return Promise.resolve({
            id: recipientId,
            employmentStatus: 'active',
            user: null,
          });
        }
        return Promise.resolve(null);
      },
    );
    await expect(
      service.createLink(creatorId, subjectId, {
        recipientEmployeeId: recipientId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('createLink_rejectsDismissedRecipient', async () => {
    setupCreateFixtures();
    prisma.employee.findUnique.mockImplementation(
      ({ where }: { where: { id?: string } }) => {
        if (where.id === subjectId) {
          return Promise.resolve({ id: subjectId });
        }
        if (where.id === recipientId) {
          return Promise.resolve({
            id: recipientId,
            employmentStatus: 'dismissed',
            user: { id: 'user-recipient' },
          });
        }
        return Promise.resolve(null);
      },
    );
    await expect(
      service.createLink(creatorId, subjectId, {
        recipientEmployeeId: recipientId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
