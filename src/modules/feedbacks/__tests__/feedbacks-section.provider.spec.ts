import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { deniedMatrixCells } from '../../../../test/support/access-matrix';
import { recordDeniedCoverage } from '../../../../test/support/matrix-coverage-collector';
import { Clock } from '../../../clock/clock.service';
import { AccessResolver } from '../../contracts/access-resolver.contract';
import { PrismaService } from '../../../prisma/prisma.service';
import { FeedbacksService } from '../feedbacks.service';
import { FeedbacksSectionProvider } from '../feedbacks-section.provider';

describe('FeedbacksSectionProvider', () => {
  let provider: FeedbacksSectionProvider;
  const feedbacks = {
    buildSection: jest.fn(),
  };
  const accessResolver = {
    resolveAudience: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedbacksSectionProvider,
        { provide: FeedbacksService, useValue: feedbacks },
        { provide: AccessResolver, useValue: accessResolver },
      ],
    }).compile();

    provider = module.get(FeedbacksSectionProvider);
  });

  it('throws when S8 grant is none', async () => {
    await expect(
      provider.getSection('viewer', 'subject', {
        role: 'Colleague',
        sections: { S8: 'none' } as never,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(deniedMatrixCells().filter((cell) => cell.section === 'S8'))(
    'throws for denied matrix audience $audience',
    async ({ audience }) => {
      const role =
        audience === 'colleague'
          ? 'Colleague'
          : audience === 'sharedLink'
            ? 'SharedLink'
            : 'Self';

      await expect(
        provider.getSection('viewer', 'subject', {
          role,
          sections: { S8: 'none' } as never,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      recordDeniedCoverage({
        kind: 'matrix',
        section: 'S8',
        audience,
      });
    },
  );

  it('delegates RW audience to service with RW access level', async () => {
    const audience = {
      role: 'ReportingLine',
      sections: { S8: 'RW' },
    } as never;
    feedbacks.buildSection.mockResolvedValue({ records: [] });

    await provider.getSection('viewer', 'subject', audience);

    expect(feedbacks.buildSection).toHaveBeenCalledWith(
      'subject',
      audience,
      'RW',
    );
  });
});

describe('FeedbacksService section filtering', () => {
  let service: FeedbacksService;
  const prisma = {
    feedbackRecord: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
    },
  };
  const clock = {
    now: jest.fn(() => new Date('2026-09-08T12:00:00.000Z')),
  };

  const baseRecord = {
    id: 'feedback-1',
    subjectEmployeeId: 'subject',
    authorEmployeeId: 'author',
    recordedAt: new Date('2026-07-01T00:00:00.000Z'),
    context: 'Q3 project retrospective',
    body: 'Private feedback',
    sharedWithEmployee: false,
    createdAt: new Date('2026-07-02T00:00:00.000Z'),
    updatedAt: new Date('2026-07-02T00:00:00.000Z'),
    authorEmployee: {
      id: 'author',
      user: { name: 'Author Name', email: 'author@example.com' },
    },
  };

  const sharedRecord = {
    ...baseRecord,
    id: 'feedback-2',
    body: 'Shared feedback',
    sharedWithEmployee: true,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedbacksService,
        { provide: PrismaService, useValue: prisma },
        { provide: Clock, useValue: clock },
      ],
    }).compile();

    service = module.get(FeedbacksService);
  });

  it('returns all records with flags for RW viewers', async () => {
    prisma.feedbackRecord.findMany.mockResolvedValue([
      baseRecord,
      sharedRecord,
    ]);

    const result = await service.buildSection(
      'subject',
      { role: 'PP', sections: { S8: 'RW' } } as never,
      'RW',
    );

    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toMatchObject({
      sharedWithEmployee: false,
    });
  });

  it('filters Self to shared records without visibility fields', async () => {
    prisma.feedbackRecord.findMany.mockResolvedValue([
      baseRecord,
      sharedRecord,
    ]);

    const result = await service.buildSection(
      'subject',
      { role: 'Self', sections: { S8: 'R' } } as never,
      'R',
    );

    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toEqual({
      id: 'feedback-2',
      recordedAt: '2026-07-01',
      context: 'Q3 project retrospective',
      body: 'Shared feedback',
      author: { id: 'author', displayName: 'Author Name' },
      createdAt: sharedRecord.createdAt.toISOString(),
      updatedAt: sharedRecord.updatedAt.toISOString(),
    });
    expect(result.records[0]).not.toHaveProperty('sharedWithEmployee');
  });

  it('returns empty records for Self when none are shared', async () => {
    prisma.feedbackRecord.findMany.mockResolvedValue([baseRecord]);

    const result = await service.buildSection(
      'subject',
      { role: 'Self', sections: { S8: 'R' } } as never,
      'R',
    );

    expect(result.records).toEqual([]);
  });

  it('uses Unknown author when author user has no name or email', async () => {
    prisma.feedbackRecord.findMany.mockResolvedValue([
      {
        ...baseRecord,
        authorEmployee: {
          id: 'author',
          user: { name: null, email: '' },
        },
      },
    ]);

    const result = await service.buildSection(
      'subject',
      { role: 'PP', sections: { S8: 'RW' } } as never,
      'RW',
    );

    expect(result.records[0]).toMatchObject({
      author: { displayName: 'Unknown author' },
    });
  });

  it('filters SharedLink R viewers to shared records only', async () => {
    prisma.feedbackRecord.findMany.mockResolvedValue([
      baseRecord,
      sharedRecord,
    ]);

    const result = await service.buildSection(
      'subject',
      { role: 'SharedLink', sections: { S8: 'R' } } as never,
      'R',
    );

    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({ id: 'feedback-2' });
    expect(result.records[0]).not.toHaveProperty('sharedWithEmployee');
  });
});

describe('FeedbacksService mutations', () => {
  let service: FeedbacksService;
  const prisma = {
    feedbackRecord: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
    },
  };
  const clock = {
    now: jest.fn(() => new Date('2026-09-08T12:00:00.000Z')),
  };

  const baseRecord = {
    id: 'feedback-1',
    subjectEmployeeId: 'subject',
    authorEmployeeId: 'author',
    recordedAt: new Date('2026-07-01T00:00:00.000Z'),
    context: 'Q3 project retrospective',
    body: 'Private feedback',
    sharedWithEmployee: false,
    createdAt: new Date('2026-07-02T00:00:00.000Z'),
    updatedAt: new Date('2026-07-02T00:00:00.000Z'),
    authorEmployee: {
      id: 'author',
      user: { name: 'Author Name', email: 'author@example.com' },
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedbacksService,
        { provide: PrismaService, useValue: prisma },
        { provide: Clock, useValue: clock },
      ],
    }).compile();

    service = module.get(FeedbacksService);
  });

  it('creates a record with default visibility flag', async () => {
    prisma.feedbackRecord.create.mockResolvedValue(baseRecord);

    const result = await service.createRecord('subject', 'author', {
      recordedAt: '2026-07-01',
      context: 'Q3 project retrospective',
      body: 'Private feedback',
    });

    expect(prisma.feedbackRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          subjectEmployeeId: 'subject',
          authorEmployeeId: 'author',
          recordedAt: new Date('2026-07-01T00:00:00.000Z'),
          context: 'Q3 project retrospective',
          body: 'Private feedback',
          sharedWithEmployee: false,
        },
      }),
    );
    expect(result).toMatchObject({
      sharedWithEmployee: false,
      context: 'Q3 project retrospective',
    });
  });

  it('rejects future recordedAt on create', async () => {
    await expect(
      service.createRecord('subject', 'author', {
        recordedAt: '2026-09-09',
        context: 'Future',
        body: 'Body',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates sharedWithEmployee without other fields', async () => {
    prisma.feedbackRecord.findFirst.mockResolvedValue(baseRecord);
    prisma.feedbackRecord.update.mockResolvedValue({
      ...baseRecord,
      sharedWithEmployee: true,
    });

    const result = await service.updateRecord('subject', 'feedback-1', {
      sharedWithEmployee: true,
    });

    expect(result.sharedWithEmployee).toBe(true);
  });

  it('rejects empty PATCH bodies', async () => {
    await expect(
      service.updateRecord('subject', 'feedback-1', {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns 404 when record belongs to another subject', async () => {
    prisma.feedbackRecord.findFirst.mockResolvedValue(null);

    await expect(
      service.updateRecord('other-subject', 'feedback-1', { body: 'Nope' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
