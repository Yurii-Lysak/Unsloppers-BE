import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { SectionAccessGate } from '../../contracts/section-access-gate.contract';
import { TimelineEventWriter } from '../../contracts/timeline-event-writer.contract';
import { MentorshipAssignmentService } from '../mentorship-assignment.service';
import { MentorshipPairService } from '../mentorship-pair.service';
import { MentorshipService } from '../mentorship.service';

describe('MentorshipAssignmentService', () => {
  let service: MentorshipAssignmentService;

  const sectionGate = {
    listS6SubjectIds: jest.fn(),
  };
  const pairService = {
    createActivePair: jest.fn(),
    endActivePair: jest.fn(),
  };
  const mentorship = {
    deriveMentorStatus: jest.fn(),
  };
  const timelineWriter = {
    recordTimelineEvent: jest.fn(),
  };
  const prisma = {
    employee: {
      findMany: jest.fn(),
    },
    mentorshipPair: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma.$transaction.mockImplementation(
      (callback: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          employee: {
            findUnique: jest.fn(),
          },
        };
        return callback(tx);
      },
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MentorshipAssignmentService,
        { provide: PrismaService, useValue: prisma },
        { provide: SectionAccessGate, useValue: sectionGate },
        { provide: MentorshipPairService, useValue: pairService },
        { provide: MentorshipService, useValue: mentorship },
        { provide: TimelineEventWriter, useValue: timelineWriter },
      ],
    }).compile();

    service = module.get(MentorshipAssignmentService);
  });

  it('returns scoped assignable mentees', async () => {
    sectionGate.listS6SubjectIds.mockResolvedValue(['mentee-1']);
    prisma.mentorshipPair.findMany.mockResolvedValue([]);
    prisma.employee.findMany.mockResolvedValue([
      {
        id: 'mentee-1',
        user: { name: 'Mentee One', email: 'mentee@example.com' },
      },
    ]);

    await expect(service.listAssignableMentees('viewer-1')).resolves.toEqual([
      { id: 'mentee-1', displayName: 'Mentee One' },
    ]);
  });

  it('returns an empty assignable mentee list when viewer has no subjects', async () => {
    sectionGate.listS6SubjectIds.mockResolvedValue([]);

    await expect(service.listAssignableMentees('viewer-1')).resolves.toEqual(
      [],
    );
    expect(prisma.mentorshipPair.findMany).not.toHaveBeenCalled();
    expect(prisma.employee.findMany).not.toHaveBeenCalled();
  });

  it('excludes mentees who already have an active pair', async () => {
    sectionGate.listS6SubjectIds.mockResolvedValue(['mentee-1', 'mentee-2']);
    prisma.mentorshipPair.findMany.mockResolvedValue([
      { menteeId: 'mentee-1' },
    ]);
    prisma.employee.findMany.mockResolvedValue([
      {
        id: 'mentee-2',
        user: { name: 'Mentee Two', email: 'mentee2@example.com' },
      },
    ]);

    await expect(service.listAssignableMentees('viewer-1')).resolves.toEqual([
      { id: 'mentee-2', displayName: 'Mentee Two' },
    ]);
  });

  it('rejects pair creation when mentee is out of scope', async () => {
    sectionGate.listS6SubjectIds.mockResolvedValue(['in-scope']);

    await expect(
      service.createPair('viewer-1', 'mentor-1', 'out-of-scope'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects pair creation when mentor is not open to mentoring', async () => {
    sectionGate.listS6SubjectIds.mockResolvedValue(['mentee-1']);

    prisma.$transaction.mockImplementation(
      (callback: (tx: { employee: { findUnique: jest.Mock } }) => unknown) => {
        const tx = {
          employee: {
            findUnique: jest.fn().mockResolvedValue({ openToMentoring: false }),
          },
        };
        return callback(tx);
      },
    );

    await expect(
      service.createPair('viewer-1', 'mentor-1', 'mentee-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(pairService.createActivePair).not.toHaveBeenCalled();
  });

  it('rejects pair creation when mentor does not exist', async () => {
    sectionGate.listS6SubjectIds.mockResolvedValue(['mentee-1']);

    prisma.$transaction.mockImplementation(
      (callback: (tx: { employee: { findUnique: jest.Mock } }) => unknown) => {
        const tx = {
          employee: {
            findUnique: jest.fn().mockResolvedValue(null),
          },
        };
        return callback(tx);
      },
    );

    await expect(
      service.createPair('viewer-1', 'missing-mentor', 'mentee-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects pair creation when mentee does not exist', async () => {
    sectionGate.listS6SubjectIds.mockResolvedValue(['mentee-1']);

    prisma.$transaction.mockImplementation(
      (callback: (tx: { employee: { findUnique: jest.Mock } }) => unknown) => {
        const tx = {
          employee: {
            findUnique: jest
              .fn()
              .mockResolvedValueOnce({ openToMentoring: true })
              .mockResolvedValueOnce(null),
          },
        };
        return callback(tx);
      },
    );

    await expect(
      service.createPair('viewer-1', 'mentor-1', 'mentee-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(pairService.createActivePair).not.toHaveBeenCalled();
  });

  it('creates a pair and writes mentorshipStart timeline events atomically', async () => {
    sectionGate.listS6SubjectIds.mockResolvedValue(['mentee-1']);
    mentorship.deriveMentorStatus.mockResolvedValue('mentor');

    const startedAt = new Date('2026-09-08T12:00:00.000Z');
    const tx = {
      employee: {
        findUnique: jest.fn().mockResolvedValue({ openToMentoring: true }),
      },
    };

    prisma.$transaction.mockImplementation(
      (callback: (transactionClient: typeof tx) => unknown) => callback(tx),
    );
    pairService.createActivePair.mockResolvedValue({
      id: 'pair-1',
      mentorId: 'mentor-1',
      menteeId: 'mentee-1',
      startedAt,
    });

    await expect(
      service.createPair('viewer-1', 'mentor-1', 'mentee-1'),
    ).resolves.toEqual({
      id: 'pair-1',
      mentorId: 'mentor-1',
      menteeId: 'mentee-1',
      startedAt: startedAt.toISOString(),
      mentorStatus: 'mentor',
    });

    expect(pairService.createActivePair).toHaveBeenCalledWith(
      'mentor-1',
      'mentee-1',
      tx,
    );
    expect(timelineWriter.recordTimelineEvent).toHaveBeenCalledTimes(2);
    expect(timelineWriter.recordTimelineEvent).toHaveBeenCalledWith(
      'mentor-1',
      'mentorshipStart',
      '2026-09-08',
      null,
      'mentee-1',
      'system',
      'viewer-1',
      tx,
    );
    expect(timelineWriter.recordTimelineEvent).toHaveBeenCalledWith(
      'mentee-1',
      'mentorshipStart',
      '2026-09-08',
      null,
      'mentor-1',
      'system',
      'viewer-1',
      tx,
    );
  });

  it('lists scoped active pairs', async () => {
    sectionGate.listS6SubjectIds.mockResolvedValue(['mentee-1']);
    prisma.mentorshipPair.findMany.mockResolvedValue([
      {
        id: 'pair-1',
        mentorId: 'mentor-1',
        menteeId: 'mentee-1',
        startedAt: new Date('2026-09-08T12:00:00.000Z'),
        endedAt: null,
        mentor: {
          user: { name: 'Mentor', email: 'mentor@example.com' },
        },
        mentee: {
          user: { name: 'Mentee', email: 'mentee@example.com' },
        },
      },
    ]);

    await expect(service.listPairs('viewer-1', 'active')).resolves.toEqual([
      {
        id: 'pair-1',
        mentorId: 'mentor-1',
        mentorDisplayName: 'Mentor',
        menteeId: 'mentee-1',
        menteeDisplayName: 'Mentee',
        startedAt: '2026-09-08T12:00:00.000Z',
        endedAt: null,
        status: 'active',
      },
    ]);

    expect(prisma.mentorshipPair.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ endedAt: null }),
      }),
    );
  });

  it('lists scoped ended pairs', async () => {
    sectionGate.listS6SubjectIds.mockResolvedValue(['mentee-1']);
    prisma.mentorshipPair.findMany.mockResolvedValue([
      {
        id: 'pair-2',
        mentorId: 'mentor-1',
        menteeId: 'mentee-1',
        startedAt: new Date('2026-01-01T12:00:00.000Z'),
        endedAt: new Date('2026-06-01T12:00:00.000Z'),
        mentor: {
          user: { name: 'Mentor', email: 'mentor@example.com' },
        },
        mentee: {
          user: { name: 'Mentee', email: 'mentee@example.com' },
        },
      },
    ]);

    await expect(service.listPairs('viewer-1', 'ended')).resolves.toEqual([
      {
        id: 'pair-2',
        mentorId: 'mentor-1',
        mentorDisplayName: 'Mentor',
        menteeId: 'mentee-1',
        menteeDisplayName: 'Mentee',
        startedAt: '2026-01-01T12:00:00.000Z',
        endedAt: '2026-06-01T12:00:00.000Z',
        status: 'ended',
      },
    ]);

    expect(prisma.mentorshipPair.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ endedAt: { not: null } }),
      }),
    );
  });

  it('lists all scoped pairs when status is all', async () => {
    sectionGate.listS6SubjectIds.mockResolvedValue(['mentee-1']);
    prisma.mentorshipPair.findMany.mockResolvedValue([]);

    await expect(service.listPairs('viewer-1', 'all')).resolves.toEqual([]);

    const [[firstArg]] = jest.mocked(prisma.mentorshipPair.findMany).mock
      .calls as unknown as [[{ where: Record<string, unknown> }]];
    expect(firstArg.where.endedAt).toBeUndefined();
  });

  it('rejects ending a pair without feedback', async () => {
    await expect(
      service.endPair('viewer-1', 'pair-1', '   '),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects ending a pair outside viewer scope', async () => {
    sectionGate.listS6SubjectIds.mockResolvedValue(['other-emp']);
    prisma.mentorshipPair.findUnique.mockResolvedValue({
      mentorId: 'mentor-1',
      menteeId: 'mentee-1',
    });

    await expect(
      service.endPair('viewer-1', 'pair-1', 'Closing note.'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('ends a pair and writes mentorshipEnd timeline events atomically', async () => {
    sectionGate.listS6SubjectIds.mockResolvedValue(['mentee-1']);
    mentorship.deriveMentorStatus.mockResolvedValue('openToMentoring');
    prisma.mentorshipPair.findUnique.mockResolvedValue({
      mentorId: 'mentor-1',
      menteeId: 'mentee-1',
    });

    const endedAt = new Date('2026-09-08T15:00:00.000Z');
    const startedAt = new Date('2026-01-01T12:00:00.000Z');
    const tx = {};

    prisma.$transaction.mockImplementation(
      (callback: (transactionClient: typeof tx) => unknown) => callback(tx),
    );
    pairService.endActivePair.mockResolvedValue({
      id: 'pair-1',
      mentorId: 'mentor-1',
      menteeId: 'mentee-1',
      startedAt,
      endedAt,
      closureFeedback: 'Pair concluded successfully.',
    });

    await expect(
      service.endPair('viewer-1', 'pair-1', 'Pair concluded successfully.'),
    ).resolves.toEqual({
      id: 'pair-1',
      mentorId: 'mentor-1',
      menteeId: 'mentee-1',
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      closureFeedback: 'Pair concluded successfully.',
      mentorStatus: 'openToMentoring',
    });

    expect(pairService.endActivePair).toHaveBeenCalled();
    expect(timelineWriter.recordTimelineEvent).toHaveBeenCalledTimes(2);
    expect(timelineWriter.recordTimelineEvent).toHaveBeenCalledWith(
      'mentor-1',
      'mentorshipEnd',
      '2026-09-08',
      null,
      'mentee-1',
      'system',
      'viewer-1',
      tx,
    );
  });
});
