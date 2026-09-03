import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Clock } from '../../../clock/clock.service';
import { AccessResolver } from '../../contracts/access-resolver.contract';
import { PrismaService } from '../../../prisma/prisma.service';
import { ActionItemsService } from '../action-items.service';

describe('ActionItemsService', () => {
  let service: ActionItemsService;
  const fixedInstant = new Date('2026-09-03T12:00:00.000Z');
  const clock = { now: jest.fn(() => fixedInstant), nowMs: jest.fn() };
  const prisma = {
    actionItem: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const accessResolver = {
    resolveAudience: jest.fn(),
  };

  const baseItem = {
    id: 'item-1',
    assigneeId: 'assignee-1',
    authorId: 'author-1',
    title: 'Task',
    description: null,
    dueDate: new Date('2026-09-15T00:00:00.000Z'),
    link: null,
    status: 'open' as const,
    source: 'manual' as const,
    campaignId: null,
    completedAt: null,
    cancelledAt: null,
    cancelledReason: null,
    createdAt: new Date('2026-09-01T12:00:00.000Z'),
    updatedAt: new Date('2026-09-01T12:00:00.000Z'),
    author: {
      id: 'author-1',
      user: { name: 'Author', email: 'author@example.com' },
    },
    assignee: {
      id: 'assignee-1',
      user: { name: 'Assignee', email: 'assignee@example.com' },
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActionItemsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccessResolver, useValue: accessResolver },
        { provide: Clock, useValue: clock },
      ],
    }).compile();

    service = module.get(ActionItemsService);
  });

  it('createActionItem persists manual source with open status', async () => {
    const createdAt = new Date('2026-09-01T12:00:00.000Z');
    prisma.actionItem.create.mockResolvedValue({
      id: 'item-1',
      assigneeId: 'assignee-1',
      authorId: 'author-1',
      title: 'Task',
      description: null,
      dueDate: new Date('2026-09-15T00:00:00.000Z'),
      link: null,
      status: 'open',
      source: 'manual',
      campaignId: null,
      completedAt: null,
      createdAt,
      updatedAt: createdAt,
      author: {
        id: 'author-1',
        user: { name: 'Author', email: 'author@example.com' },
      },
      assignee: {
        id: 'assignee-1',
        user: { name: 'Assignee', email: 'assignee@example.com' },
      },
    });

    const result = await service.createActionItem({
      assigneeId: 'assignee-1',
      authorId: 'author-1',
      title: 'Task',
      dueDate: '2026-09-15',
      source: 'manual',
    });

    expect(prisma.actionItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assigneeId: 'assignee-1',
        authorId: 'author-1',
        status: 'open',
        source: 'manual',
      }) as object,
      include: expect.any(Object) as object,
    });
    expect(result).toMatchObject({
      id: 'item-1',
      status: 'open',
      source: 'manual',
      dueDate: '2026-09-15',
      isOverdue: false,
    });
  });

  it('createActionItem sets isOverdue true for open past-due items', async () => {
    clock.now.mockReturnValue(new Date('2026-09-03T12:00:00.000Z'));
    const createdAt = new Date('2026-09-01T12:00:00.000Z');
    prisma.actionItem.create.mockResolvedValue({
      id: 'item-overdue',
      assigneeId: 'assignee-1',
      authorId: 'author-1',
      title: 'Late task',
      description: null,
      dueDate: new Date('2026-09-01T00:00:00.000Z'),
      link: null,
      status: 'open',
      source: 'manual',
      campaignId: null,
      completedAt: null,
      cancelledAt: null,
      cancelledReason: null,
      createdAt,
      updatedAt: createdAt,
      author: {
        id: 'author-1',
        user: { name: 'Author', email: 'author@example.com' },
      },
      assignee: {
        id: 'assignee-1',
        user: { name: 'Assignee', email: 'assignee@example.com' },
      },
    });

    const result = await service.createActionItem({
      assigneeId: 'assignee-1',
      authorId: 'author-1',
      title: 'Late task',
      dueDate: '2026-09-01',
      source: 'manual',
    });

    expect(result.isOverdue).toBe(true);
  });

  it('createActionItem rejects invalid calendar dates', async () => {
    await expect(
      service.createActionItem({
        assigneeId: 'assignee-1',
        authorId: 'author-1',
        title: 'Task',
        dueDate: '2026-02-30',
        source: 'manual',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.actionItem.create).not.toHaveBeenCalled();
  });

  it('createActionItem rejects whitespace-only titles', async () => {
    await expect(
      service.createActionItem({
        assigneeId: 'assignee-1',
        authorId: 'author-1',
        title: '   ',
        dueDate: '2026-09-15',
        source: 'manual',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.actionItem.create).not.toHaveBeenCalled();
  });

  it('buildSection filters Self R to assignee-owned items', async () => {
    prisma.actionItem.findMany.mockResolvedValue([
      {
        id: 'own-item',
        assigneeId: 'subject-1',
        authorId: 'other',
        title: 'Mine',
        description: null,
        dueDate: new Date('2026-09-15T00:00:00.000Z'),
        link: null,
        status: 'open',
        source: 'manual',
        campaignId: null,
        completedAt: null,
        createdAt: new Date('2026-09-01T12:00:00.000Z'),
        updatedAt: new Date('2026-09-01T12:00:00.000Z'),
        author: {
          id: 'other',
          user: { name: 'Other', email: 'other@example.com' },
        },
        assignee: {
          id: 'subject-1',
          user: { name: 'Subject', email: 'subject@example.com' },
        },
      },
      {
        id: 'foreign-item',
        assigneeId: 'other-subject',
        authorId: 'other',
        title: 'Not mine',
        description: null,
        dueDate: new Date('2026-09-16T00:00:00.000Z'),
        link: null,
        status: 'open',
        source: 'manual',
        campaignId: null,
        completedAt: null,
        createdAt: new Date('2026-09-01T12:00:00.000Z'),
        updatedAt: new Date('2026-09-01T12:00:00.000Z'),
        author: {
          id: 'other',
          user: { name: 'Other', email: 'other@example.com' },
        },
        assignee: {
          id: 'other-subject',
          user: { name: 'Other', email: 'other2@example.com' },
        },
      },
    ]);

    const result = await service.buildSection('subject-1', {
      role: 'Self',
      sections: { S14: 'R' },
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('own-item');
  });

  it('listAuthoredOpenItems omits items when live S14 access is none', async () => {
    prisma.actionItem.findMany.mockResolvedValue([
      {
        id: 'item-1',
        assigneeId: 'assignee-1',
        authorId: 'author-1',
        title: 'Task',
        description: null,
        dueDate: new Date('2026-09-15T00:00:00.000Z'),
        link: null,
        status: 'open',
        source: 'manual',
        campaignId: null,
        completedAt: null,
        createdAt: new Date('2026-09-01T12:00:00.000Z'),
        updatedAt: new Date('2026-09-01T12:00:00.000Z'),
        author: {
          id: 'author-1',
          user: { name: 'Author', email: 'author@example.com' },
        },
        assignee: {
          id: 'assignee-1',
          user: { name: 'Assignee', email: 'assignee@example.com' },
        },
      },
    ]);
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'Colleague',
      sections: { S14: 'none' },
    });

    const result = await service.listAuthoredOpenItems('author-1');
    expect(result).toEqual([]);
  });

  it('listAuthoredOpenItems returns assignee summary when S14 access remains', async () => {
    prisma.actionItem.findMany.mockResolvedValue([
      {
        id: 'item-1',
        assigneeId: 'assignee-1',
        authorId: 'author-1',
        title: 'Task',
        description: null,
        dueDate: new Date('2026-09-15T00:00:00.000Z'),
        link: null,
        status: 'open',
        source: 'manual',
        campaignId: null,
        completedAt: null,
        createdAt: new Date('2026-09-01T12:00:00.000Z'),
        updatedAt: new Date('2026-09-01T12:00:00.000Z'),
        author: {
          id: 'author-1',
          user: { name: 'Author', email: 'author@example.com' },
        },
        assignee: {
          id: 'assignee-1',
          user: { name: 'Assignee', email: 'assignee@example.com' },
        },
      },
    ]);
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'ReportingLine',
      sections: { S14: 'RW' },
    });

    const result = await service.listAuthoredOpenItems('author-1');
    expect(result).toEqual([
      expect.objectContaining({
        id: 'item-1',
        assignee: { id: 'assignee-1', displayName: 'Assignee' },
      }),
    ]);
  });

  it('completeActionItem sets completedAt from Clock for the assignee', async () => {
    prisma.actionItem.findFirst
      .mockResolvedValueOnce(baseItem)
      .mockResolvedValueOnce({
        ...baseItem,
        status: 'completed',
        completedAt: fixedInstant,
      });
    prisma.actionItem.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.completeActionItem(
      'assignee-1',
      'item-1',
      'assignee-1',
    );

    expect(prisma.actionItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'item-1', status: 'open' },
      data: {
        status: 'completed',
        completedAt: fixedInstant,
      },
    });
    expect(result).toMatchObject({
      status: 'completed',
      completedAt: fixedInstant.toISOString(),
      isOverdue: false,
    });
  });

  it('completeActionItem rejects non-assignee viewers', async () => {
    prisma.actionItem.findFirst.mockResolvedValue(baseItem);

    await expect(
      service.completeActionItem('assignee-1', 'item-1', 'author-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.actionItem.updateMany).not.toHaveBeenCalled();
  });

  it('completeActionItem rejects terminal items', async () => {
    prisma.actionItem.findFirst.mockResolvedValue({
      ...baseItem,
      status: 'completed',
      completedAt: fixedInstant,
    });

    await expect(
      service.completeActionItem('assignee-1', 'item-1', 'assignee-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('cancelActionItem stores reason and cancelledAt for open items', async () => {
    prisma.actionItem.findFirst
      .mockResolvedValueOnce(baseItem)
      .mockResolvedValueOnce({
        ...baseItem,
        status: 'cancelled',
        cancelledAt: fixedInstant,
        cancelledReason: 'No longer needed',
      });
    prisma.actionItem.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.cancelActionItem('item-1', 'author-1', {
      reason: 'No longer needed',
    });

    expect(prisma.actionItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'item-1', status: 'open' },
      data: {
        status: 'cancelled',
        cancelledAt: fixedInstant,
        cancelledReason: 'No longer needed',
      },
    });
    expect(result).toMatchObject({
      status: 'cancelled',
      cancelledAt: fixedInstant.toISOString(),
      cancelledReason: 'No longer needed',
      isOverdue: false,
    });
  });

  it('cancelActionItem is idempotent for already-cancelled items', async () => {
    prisma.actionItem.findFirst.mockResolvedValue({
      ...baseItem,
      status: 'cancelled',
      cancelledAt: fixedInstant,
      cancelledReason: 'Original reason',
    });

    const result = await service.cancelActionItem('item-1', 'author-1', {});

    expect(prisma.actionItem.updateMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'cancelled',
      cancelledReason: 'Original reason',
    });
  });

  it('completeActionItem returns 409 when a concurrent mutation closed the item', async () => {
    prisma.actionItem.findFirst
      .mockResolvedValueOnce(baseItem)
      .mockResolvedValueOnce({
        ...baseItem,
        status: 'cancelled',
        cancelledAt: fixedInstant,
        cancelledReason: 'Beat you to it',
      });
    prisma.actionItem.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.completeActionItem('assignee-1', 'item-1', 'assignee-1'),
    ).rejects.toMatchObject({
      response: {
        message: 'Action item is not open',
        status: 'cancelled',
      },
    });
  });

  it('cancelActionItem returns idempotent result when a concurrent cancel won the race', async () => {
    prisma.actionItem.findFirst
      .mockResolvedValueOnce(baseItem)
      .mockResolvedValueOnce({
        ...baseItem,
        status: 'cancelled',
        cancelledAt: fixedInstant,
        cancelledReason: 'First reason',
      });
    prisma.actionItem.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.cancelActionItem('item-1', 'author-1', {
      reason: 'Second reason',
    });

    expect(result).toMatchObject({
      status: 'cancelled',
      cancelledReason: 'First reason',
    });
  });

  it('cancelActionItem rejects completed items', async () => {
    prisma.actionItem.findFirst.mockResolvedValue({
      ...baseItem,
      status: 'completed',
      completedAt: fixedInstant,
    });

    await expect(
      service.cancelActionItem('item-1', 'author-1', { reason: 'Too late' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('cancelActionItem requires a trimmed reason for open items', async () => {
    prisma.actionItem.findFirst.mockResolvedValue(baseItem);

    await expect(
      service.cancelActionItem('item-1', 'author-1', { reason: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.cancelActionItem('item-1', 'author-1', {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cancelActionItem returns 404 when the viewer is not the author', async () => {
    prisma.actionItem.findFirst.mockResolvedValue(null);

    await expect(
      service.cancelActionItem('item-1', 'other-author', { reason: 'Nope' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('buildSection includes terminal fields on completed items', async () => {
    prisma.actionItem.findMany.mockResolvedValue([
      {
        ...baseItem,
        status: 'completed',
        completedAt: fixedInstant,
      },
    ]);

    const result = await service.buildSection('assignee-1', {
      role: 'ReportingLine',
      sections: { S14: 'RW' },
    });

    expect(result.items[0]).toMatchObject({
      status: 'completed',
      completedAt: fixedInstant.toISOString(),
      isOverdue: false,
    });
  });

  it('buildSection marks open past-due items as overdue', async () => {
    clock.now.mockReturnValue(new Date('2026-09-03T12:00:00.000Z'));
    prisma.actionItem.findMany.mockResolvedValue([
      {
        ...baseItem,
        dueDate: new Date('2026-09-01T00:00:00.000Z'),
      },
    ]);

    const result = await service.buildSection('assignee-1', {
      role: 'ReportingLine',
      sections: { S14: 'RW' },
    });

    expect(result.items[0].isOverdue).toBe(true);
  });

  it('listAuthoredOpenItems includes isOverdue on authored DTOs', async () => {
    clock.now.mockReturnValue(new Date('2026-09-03T12:00:00.000Z'));
    prisma.actionItem.findMany.mockResolvedValue([
      {
        ...baseItem,
        dueDate: new Date('2026-09-01T00:00:00.000Z'),
      },
    ]);
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'ReportingLine',
      sections: { S14: 'RW' },
    });

    const result = await service.listAuthoredOpenItems('author-1');
    expect(result[0].isOverdue).toBe(true);
  });
});
