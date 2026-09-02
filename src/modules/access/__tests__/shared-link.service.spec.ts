import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Clock } from '../../../clock/clock.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AccessResolver } from '../../contracts/access-resolver.contract';
import { SharedLinkService } from '../shared-link.service';

describe('SharedLinkService', () => {
  let service: SharedLinkService;
  let accessResolver: jest.Mocked<AccessResolver>;
  let prisma: {
    sharedLink: { create: jest.Mock; findUnique: jest.Mock };
    employee: { findUnique: jest.Mock };
  };
  let clock: { nowMs: jest.Mock };

  const creatorId = 'creator-id';
  const subjectId = 'subject-id';
  const recipientId = 'recipient-id';

  beforeEach(async () => {
    accessResolver = {
      resolveAudience: jest.fn(),
    };

    prisma = {
      sharedLink: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
      },
      employee: {
        findUnique: jest.fn(),
      },
    };

    clock = { nowMs: jest.fn().mockReturnValue(1_700_000_000_000) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SharedLinkService,
        { provide: AccessResolver, useValue: accessResolver },
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
      id: 'link',
      token: 'a'.repeat(43),
      subjectEmployeeId: subjectId,
      creatorEmployeeId: creatorId,
      recipientEmployeeId: recipientId,
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

  it('assertRecipient_rejectsWrongViewer', () => {
    expect(() =>
      service.assertRecipient(
        {
          id: 'link',
          token: 'x',
          subjectEmployeeId: subjectId,
          creatorEmployeeId: creatorId,
          recipientEmployeeId: recipientId,
          sectionIds: ['S1'],
        },
        'other-viewer',
      ),
    ).toThrow(ForbiddenException);
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
