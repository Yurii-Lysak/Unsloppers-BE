import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Clock } from '../../../clock/clock.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { RisksService } from '../risks.service';

type PrismaMock = {
  riskRecord: {
    create: jest.Mock;
    findMany: jest.Mock;
  };
};

describe('RisksService', () => {
  let service: RisksService;
  const fixedInstant = new Date('2026-09-03T12:00:00.000Z');
  const clock = { now: jest.fn(() => fixedInstant), nowMs: jest.fn() };
  const prisma: PrismaMock = {
    riskRecord: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const authorInclude = {
    authorEmployee: {
      include: {
        user: { select: { name: true, email: true } },
      },
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RisksService,
        { provide: PrismaService, useValue: prisma },
        { provide: Clock, useValue: clock },
      ],
    }).compile();

    service = module.get(RisksService);
  });

  it('buildSection returns records and currentLevel from the latest record', async () => {
    prisma.riskRecord.findMany.mockResolvedValue([
      {
        id: 'risk-2',
        subjectEmployeeId: 'subject-1',
        authorEmployeeId: 'author-1',
        level: 'high',
        description: 'Recent',
        details: 'Recent details',
        recordedAt: new Date('2026-09-02T00:00:00.000Z'),
        createdAt: new Date('2026-09-02T10:00:00.000Z'),
        authorEmployee: {
          id: 'author-1',
          user: { name: 'Manager', email: 'manager@example.com' },
        },
      },
      {
        id: 'risk-1',
        subjectEmployeeId: 'subject-1',
        authorEmployeeId: 'author-1',
        level: 'low',
        description: 'Older',
        details: 'Older details',
        recordedAt: new Date('2026-08-01T00:00:00.000Z'),
        createdAt: new Date('2026-08-01T10:00:00.000Z'),
        authorEmployee: {
          id: 'author-1',
          user: { name: 'Manager', email: 'manager@example.com' },
        },
      },
    ]);

    await expect(service.buildSection('subject-1')).resolves.toEqual({
      records: [
        expect.objectContaining({
          id: 'risk-2',
          level: 'high',
          recordedAt: '2026-09-02',
        }),
        expect.objectContaining({
          id: 'risk-1',
          level: 'low',
          recordedAt: '2026-08-01',
        }),
      ],
      currentLevel: 'high',
      trend: 'up',
    });

    expect(prisma.riskRecord.findMany).toHaveBeenCalledWith({
      where: { subjectEmployeeId: 'subject-1' },
      include: authorInclude,
      orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    });
  });

  it('buildSection omits currentLevel when there are no records', async () => {
    prisma.riskRecord.findMany.mockResolvedValue([]);

    await expect(service.buildSection('subject-1')).resolves.toEqual({
      records: [],
    });
  });

  it('buildSection omits trend when there is only one record', async () => {
    prisma.riskRecord.findMany.mockResolvedValue([
      {
        id: 'risk-1',
        subjectEmployeeId: 'subject-1',
        authorEmployeeId: 'author-1',
        level: 'medium',
        description: 'Only record',
        details: 'Only details',
        recordedAt: new Date('2026-09-01T00:00:00.000Z'),
        createdAt: new Date('2026-09-01T10:00:00.000Z'),
        authorEmployee: {
          id: 'author-1',
          user: { name: 'Manager', email: 'manager@example.com' },
        },
      },
    ]);

    const section = await service.buildSection('subject-1');
    expect(section.currentLevel).toBe('medium');
    expect(section.trend).toBeUndefined();
  });

  it('buildSection returns trend down when risk improves', async () => {
    prisma.riskRecord.findMany.mockResolvedValue([
      {
        id: 'risk-2',
        subjectEmployeeId: 'subject-1',
        authorEmployeeId: 'author-1',
        level: 'low',
        description: 'Improved',
        details: 'Improved details',
        recordedAt: new Date('2026-09-02T00:00:00.000Z'),
        createdAt: new Date('2026-09-02T10:00:00.000Z'),
        authorEmployee: {
          id: 'author-1',
          user: { name: 'Manager', email: 'manager@example.com' },
        },
      },
      {
        id: 'risk-1',
        subjectEmployeeId: 'subject-1',
        authorEmployeeId: 'author-1',
        level: 'high',
        description: 'Older',
        details: 'Older details',
        recordedAt: new Date('2026-08-01T00:00:00.000Z'),
        createdAt: new Date('2026-08-01T10:00:00.000Z'),
        authorEmployee: {
          id: 'author-1',
          user: { name: 'Manager', email: 'manager@example.com' },
        },
      },
    ]);

    const section = await service.buildSection('subject-1');
    expect(section.trend).toBe('down');
  });

  it('buildSection returns trend flat when level is unchanged', async () => {
    prisma.riskRecord.findMany.mockResolvedValue([
      {
        id: 'risk-2',
        subjectEmployeeId: 'subject-1',
        authorEmployeeId: 'author-1',
        level: 'medium',
        description: 'Same level',
        details: 'New details',
        recordedAt: new Date('2026-09-02T00:00:00.000Z'),
        createdAt: new Date('2026-09-02T10:00:00.000Z'),
        authorEmployee: {
          id: 'author-1',
          user: { name: 'Manager', email: 'manager@example.com' },
        },
      },
      {
        id: 'risk-1',
        subjectEmployeeId: 'subject-1',
        authorEmployeeId: 'author-1',
        level: 'medium',
        description: 'Older',
        details: 'Older details',
        recordedAt: new Date('2026-08-01T00:00:00.000Z'),
        createdAt: new Date('2026-08-01T10:00:00.000Z'),
        authorEmployee: {
          id: 'author-1',
          user: { name: 'Manager', email: 'manager@example.com' },
        },
      },
    ]);

    const section = await service.buildSection('subject-1');
    expect(section.trend).toBe('flat');
  });

  it('createRecord persists a normalized risk record', async () => {
    const createdAt = new Date('2026-09-03T12:00:00.000Z');
    prisma.riskRecord.create.mockResolvedValue({
      id: 'risk-1',
      subjectEmployeeId: 'subject-1',
      authorEmployeeId: 'author-1',
      level: 'medium',
      description: 'Flight risk',
      details: 'Discussed retention options',
      recordedAt: new Date('2026-09-01T00:00:00.000Z'),
      createdAt,
      authorEmployee: {
        id: 'author-1',
        user: { name: 'People Partner', email: 'pp@example.com' },
      },
    });

    const result = await service.createRecord('subject-1', 'author-1', {
      level: 'medium',
      description: '  Flight risk  ',
      details: 'Discussed retention options',
      recordedAt: '2026-09-01',
    });

    expect(prisma.riskRecord.create).toHaveBeenCalledWith({
      data: {
        subjectEmployeeId: 'subject-1',
        authorEmployeeId: 'author-1',
        level: 'medium',
        description: 'Flight risk',
        details: 'Discussed retention options',
        recordedAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      include: authorInclude,
    });
    expect(result).toMatchObject({
      id: 'risk-1',
      level: 'medium',
      description: 'Flight risk',
      recordedAt: '2026-09-01',
      author: { id: 'author-1', displayName: 'People Partner' },
    });
  });

  it('createRecord rejects whitespace-only description', async () => {
    await expect(
      service.createRecord('subject-1', 'author-1', {
        level: 'low',
        description: '   ',
        details: 'Valid details',
        recordedAt: '2026-09-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('createRecord rejects future recordedAt', async () => {
    await expect(
      service.createRecord('subject-1', 'author-1', {
        level: 'high',
        description: 'Concern',
        details: 'Details',
        recordedAt: '2026-09-10',
      }),
    ).rejects.toThrow('recordedAt must not be in the future');
  });

  it('createRecord rejects whitespace-only details', async () => {
    await expect(
      service.createRecord('subject-1', 'author-1', {
        level: 'low',
        description: 'Valid description',
        details: '   ',
        recordedAt: '2026-09-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
