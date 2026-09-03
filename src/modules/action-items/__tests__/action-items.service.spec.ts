import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AccessResolver } from '../../contracts/access-resolver.contract';
import { PrismaService } from '../../../prisma/prisma.service';
import { ActionItemsService } from '../action-items.service';

describe('ActionItemsService', () => {
  let service: ActionItemsService;
  const prisma = {
    actionItem: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const accessResolver = {
    resolveAudience: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActionItemsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccessResolver, useValue: accessResolver },
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
    });
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
});
