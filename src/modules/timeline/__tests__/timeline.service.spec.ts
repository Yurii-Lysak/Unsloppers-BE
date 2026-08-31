import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AccessResolver } from '../../contracts/access-resolver.contract';
import { TimelineEventWriter } from '../../contracts/timeline-event-writer.contract';
import { TimelineService } from '../timeline.service';

describe('TimelineService', () => {
  let service: TimelineService;

  const accessResolver = {
    resolveAudience: jest.fn(),
  };
  const timelineEventWriter = {
    recordTimelineEvent: jest.fn(),
    markSystemWriteSkipped: jest.fn(),
  };
  const prisma = {
    employee: { findUnique: jest.fn() },
    timelineEvent: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  const subjectId = 'emp-subject';
  const viewerId = 'emp-pp';

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma.employee.findUnique.mockResolvedValue({ id: subjectId });
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'PP',
      sections: { S9: 'RW' },
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimelineService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccessResolver, useValue: accessResolver },
        { provide: TimelineEventWriter, useValue: timelineEventWriter },
      ],
    }).compile();

    service = module.get(TimelineService);
  });

  it('lists active events in chronological order', async () => {
    const older = {
      id: 'evt-1',
      employeeId: subjectId,
      type: 'grade',
      effectiveDate: new Date('2018-01-01'),
      createdAt: new Date('2026-01-02'),
      source: 'manual',
    };
    const newerSameDay = {
      id: 'evt-2',
      employeeId: subjectId,
      type: 'position',
      effectiveDate: new Date('2019-03-15'),
      createdAt: new Date('2026-01-01'),
      source: 'manual',
    };
    prisma.timelineEvent.findMany.mockResolvedValue([older, newerSameDay]);

    const result = await service.listEvents(viewerId, subjectId);

    expect(prisma.timelineEvent.findMany).toHaveBeenCalledWith({
      where: { employeeId: subjectId, deletedAt: null },
      orderBy: [{ effectiveDate: 'asc' }, { createdAt: 'asc' }],
    });
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('evt-1');
  });

  it('rejects read when S9 is none', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'Colleague',
      sections: { S9: 'none' },
    });

    await expect(service.listEvents(viewerId, subjectId)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('creates a manual event through C4 with authorId', async () => {
    timelineEventWriter.recordTimelineEvent.mockResolvedValue(undefined);
    prisma.timelineEvent.findFirst.mockResolvedValue({
      id: 'evt-new',
      employeeId: subjectId,
      type: 'grade',
      effectiveDate: new Date('2019-03-15'),
      oldValue: 'Middle',
      newValue: 'Senior',
      source: 'manual',
      authorId: viewerId,
      systemWriteSkippedAt: null,
      deletedAt: null,
      deletedById: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      updatedById: null,
    });

    const result = await service.createManualEvent(viewerId, subjectId, {
      type: 'grade',
      effectiveDate: '2019-03-15',
      oldValue: 'Middle',
      newValue: 'Senior',
    });

    expect(timelineEventWriter.recordTimelineEvent).toHaveBeenCalledWith(
      subjectId,
      'grade',
      '2019-03-15',
      'Middle',
      'Senior',
      'manual',
      viewerId,
    );
    expect(result.source).toBe('manual');
    expect(result.authorId).toBe(viewerId);
  });

  it('rejects write for ProjectLine even when S9 is RW', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'ProjectLine',
      sections: { S9: 'RW' },
    });

    await expect(
      service.createManualEvent(viewerId, subjectId, {
        type: 'grade',
        effectiveDate: '2019-03-15',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(timelineEventWriter.recordTimelineEvent).not.toHaveBeenCalled();
  });

  it('allows ReportingLine write', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'ReportingLine',
      sections: { S9: 'RW' },
    });
    timelineEventWriter.recordTimelineEvent.mockResolvedValue(undefined);
    prisma.timelineEvent.findFirst.mockResolvedValue({
      id: 'evt-um',
      employeeId: subjectId,
      type: 'grade',
      effectiveDate: new Date('2019-03-15'),
      oldValue: null,
      newValue: 'Senior',
      source: 'manual',
      authorId: viewerId,
      systemWriteSkippedAt: null,
      deletedAt: null,
      deletedById: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      updatedById: null,
    });

    await service.createManualEvent(viewerId, subjectId, {
      type: 'grade',
      effectiveDate: '2019-03-15',
      newValue: 'Senior',
    });

    expect(timelineEventWriter.recordTimelineEvent).toHaveBeenCalled();
  });

  it('maps duplicate manual key to ConflictException', async () => {
    timelineEventWriter.recordTimelineEvent.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.createManualEvent(viewerId, subjectId, {
        type: 'grade',
        effectiveDate: '2019-03-15',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects update on system events', async () => {
    prisma.timelineEvent.findFirst.mockResolvedValue({
      id: 'evt-system',
      employeeId: subjectId,
      source: 'system',
    });

    await expect(
      service.updateManualEvent(viewerId, subjectId, 'evt-system', {
        newValue: 'Changed',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('soft-deletes manual events with audit fields', async () => {
    prisma.timelineEvent.findFirst.mockResolvedValue({
      id: 'evt-manual',
      employeeId: subjectId,
      source: 'manual',
    });
    prisma.timelineEvent.update.mockResolvedValue({});

    await service.softDeleteManualEvent(viewerId, subjectId, 'evt-manual');

    expect(prisma.timelineEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt-manual' },
      data: {
        deletedAt: expect.any(Date) as Date,
        deletedById: viewerId,
        updatedById: viewerId,
      },
    });
  });

  it('rejects delete on system events', async () => {
    prisma.timelineEvent.findFirst.mockResolvedValue({
      id: 'evt-system',
      employeeId: subjectId,
      source: 'system',
    });

    await expect(
      service.softDeleteManualEvent(viewerId, subjectId, 'evt-system'),
    ).rejects.toThrow(ForbiddenException);
  });
});
