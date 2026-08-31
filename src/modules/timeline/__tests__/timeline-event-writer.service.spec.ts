import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { TimelineEventWriteContext } from '../../contracts/timeline-event-writer.contract';
import { TimelineEventWriterService } from '../timeline-event-writer.service';

describe('TimelineEventWriterService', () => {
  let service: TimelineEventWriterService;
  let prisma: {
    timelineEvent: {
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let errorSpy: jest.SpyInstance;

  beforeEach(async () => {
    prisma = {
      timelineEvent: {
        create: jest.fn().mockResolvedValue({ id: 'evt-1' }),
        update: jest.fn().mockResolvedValue({ id: 'manual-1' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimelineEventWriterService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(TimelineEventWriterService);
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('recordTimelineEvent persists a system event with old/new JSON values', async () => {
    await service.recordTimelineEvent(
      'emp-1',
      'grade',
      '2026-09-01',
      'Middle',
      'Senior',
      'system',
    );

    expect(prisma.timelineEvent.create).toHaveBeenCalledWith({
      data: {
        employeeId: 'emp-1',
        type: 'grade',
        effectiveDate: new Date('2026-09-01'),
        oldValue: 'Middle',
        newValue: 'Senior',
        source: 'system',
        authorId: null,
      },
    });
  });

  it('recordTimelineEvent stores null oldValue as DbNull', async () => {
    await service.recordTimelineEvent(
      'emp-1',
      'grade',
      '2026-09-01',
      null,
      'Senior',
      'system',
    );

    expect(prisma.timelineEvent.create).toHaveBeenCalledWith({
      data: {
        employeeId: 'emp-1',
        type: 'grade',
        effectiveDate: new Date('2026-09-01'),
        oldValue: Prisma.DbNull,
        newValue: 'Senior',
        source: 'system',
        authorId: null,
      },
    });
  });

  it('recordTimelineEvent uses the supplied transaction client', async () => {
    const tx = {
      timelineEvent: {
        create: jest.fn().mockResolvedValue({ id: 'evt-tx' }),
        update: jest.fn(),
      },
    } satisfies TimelineEventWriteContext;

    await service.recordTimelineEvent(
      'emp-1',
      'grade',
      '2026-09-01',
      'Middle',
      'Senior',
      'system',
      undefined,
      tx,
    );

    expect(tx.timelineEvent.create).toHaveBeenCalled();
    expect(prisma.timelineEvent.create).not.toHaveBeenCalled();
  });

  it('recordTimelineEvent rethrows when persistence fails inside a transaction', async () => {
    const tx = {
      timelineEvent: {
        create: jest.fn().mockRejectedValue(new Error('unique violation')),
        update: jest.fn(),
      },
    } satisfies TimelineEventWriteContext;

    await expect(
      service.recordTimelineEvent(
        'emp-1',
        'grade',
        '2026-09-01',
        'Middle',
        'Senior',
        'system',
        undefined,
        tx,
      ),
    ).rejects.toThrow('unique violation');

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('recordTimelineEvent soft-fails for external callers without a transaction', async () => {
    prisma.timelineEvent.create.mockRejectedValueOnce(
      new Error('transient db error'),
    );

    await expect(
      service.recordTimelineEvent(
        'emp-1',
        'grade',
        '2026-09-01',
        'Middle',
        'Senior',
        'system',
      ),
    ).resolves.toBeUndefined();

    const calls = errorSpy.mock.calls as Array<[string]>;
    const logMessage = calls[0]?.[0];
    expect(typeof logMessage).toBe('string');
    expect(logMessage).toContain('TIMELINE_WRITE_RETRY');
    expect(logMessage).toContain('emp-1');
    expect(logMessage).toContain('grade');
    expect(logMessage).toContain('2026-09-01');
  });

  it('markSystemWriteSkipped sets systemWriteSkippedAt on the manual event', async () => {
    await service.markSystemWriteSkipped(
      'manual-1',
      '2026-08-31T12:00:00.000Z',
    );

    expect(prisma.timelineEvent.update).toHaveBeenCalledWith({
      where: { id: 'manual-1' },
      data: {
        systemWriteSkippedAt: new Date('2026-08-31T12:00:00.000Z'),
      },
    });
  });

  it('markSystemWriteSkipped uses the supplied transaction client', async () => {
    const tx = {
      timelineEvent: {
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'manual-1' }),
      },
    } satisfies TimelineEventWriteContext;

    await service.markSystemWriteSkipped(
      'manual-1',
      '2026-08-31T12:00:00.000Z',
      tx,
    );

    expect(tx.timelineEvent.update).toHaveBeenCalled();
    expect(prisma.timelineEvent.update).not.toHaveBeenCalled();
  });
});
