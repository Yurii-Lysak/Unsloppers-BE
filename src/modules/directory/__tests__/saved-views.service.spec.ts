import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { SavedViewsService } from '../saved-views.service';

describe('SavedViewsService', () => {
  let service: SavedViewsService;

  const prisma = {
    savedView: {
      findMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    savedViewShare: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    employee: {
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const viewRecord = {
    id: 'view-1',
    name: 'Needs a conversation',
    ownerEmployeeId: 'owner-1',
    filters: [{ fieldId: 'grade', operator: 'eq', value: 'Senior' }],
    columnIds: ['name', 'grade'],
    sort: 'name',
    order: 'asc',
    createdAt: new Date(),
    updatedAt: new Date(),
    ownerEmployee: { user: { name: 'Owner User' } },
    shares: [],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => Promise<void>) =>
        callback(prisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SavedViewsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(SavedViewsService);
  });

  it('lists owned and shared views for the viewer', async () => {
    prisma.savedView.findMany.mockResolvedValue([viewRecord]);

    const result = await service.listForViewer('owner-1');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'view-1',
      isOwner: true,
      canEdit: true,
      columnIds: ['name', 'grade'],
    });
  });

  it('creates a saved view for the owner', async () => {
    prisma.savedView.create.mockResolvedValue(viewRecord);

    const result = await service.create('owner-1', {
      name: 'Needs a conversation',
      filters: [{ fieldId: 'grade', operator: 'eq', value: 'Senior' }],
      columnIds: ['name', 'grade'],
      sort: 'name',
      order: 'asc',
    });

    expect(prisma.savedView.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerEmployeeId: 'owner-1',
          name: 'Needs a conversation',
        }),
      }),
    );
    expect(result.name).toBe('Needs a conversation');
  });

  it('forbids non-owners from updating a view', async () => {
    prisma.savedView.findUnique.mockResolvedValue({
      ...viewRecord,
      shares: [{ recipientEmployeeId: 'recipient-1' }],
    });

    await expect(
      service.update('recipient-1', 'view-1', { name: 'Renamed' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('updates only the provided fields for the owner, leaving the rest untouched', async () => {
    prisma.savedView.findUnique.mockResolvedValue(viewRecord);
    prisma.savedView.update.mockResolvedValue({
      ...viewRecord,
      name: 'Renamed',
    });

    const result = await service.update('owner-1', 'view-1', {
      name: 'Renamed',
    });

    expect(prisma.savedView.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'view-1' },
        data: { name: 'Renamed' },
      }),
    );
    expect(result.name).toBe('Renamed');
    expect(result.columnIds).toEqual(viewRecord.columnIds);
  });

  it('deletes a view for the owner', async () => {
    prisma.savedView.findUnique.mockResolvedValue(viewRecord);

    await service.remove('owner-1', 'view-1');

    expect(prisma.savedView.delete).toHaveBeenCalledWith({
      where: { id: 'view-1' },
    });
  });

  it('forbids non-owners from deleting a view', async () => {
    prisma.savedView.findUnique.mockResolvedValue({
      ...viewRecord,
      shares: [{ recipientEmployeeId: 'recipient-1' }],
    });

    await expect(
      service.remove('recipient-1', 'view-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.savedView.delete).not.toHaveBeenCalled();
  });

  it('rejects sharing a view with oneself', async () => {
    prisma.savedView.findUnique.mockResolvedValue(viewRecord);

    await expect(
      service.replaceShares('owner-1', 'view-1', {
        recipientEmployeeIds: ['owner-1'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.savedViewShare.deleteMany).not.toHaveBeenCalled();
  });

  it('removes a recipient from the share list, leaving the remaining recipient shared', async () => {
    prisma.savedView.findUnique.mockResolvedValue({
      ...viewRecord,
      shares: [
        { recipientEmployeeId: 'recipient-1' },
        { recipientEmployeeId: 'recipient-2' },
      ],
    });
    prisma.employee.count.mockResolvedValue(1);
    prisma.savedView.findUniqueOrThrow.mockResolvedValue({
      ...viewRecord,
      shares: [
        {
          recipientEmployeeId: 'recipient-2',
          recipientEmployee: { user: { name: 'Recipient Two' } },
        },
      ],
    });

    const result = await service.replaceShares('owner-1', 'view-1', {
      recipientEmployeeIds: ['recipient-2'],
    });

    expect(prisma.savedViewShare.deleteMany).toHaveBeenCalledWith({
      where: { savedViewId: 'view-1' },
    });
    expect(prisma.savedViewShare.createMany).toHaveBeenCalledWith({
      data: [{ savedViewId: 'view-1', recipientEmployeeId: 'recipient-2' }],
    });
    expect(result.sharedWith).toEqual([
      { employeeId: 'recipient-2', name: 'Recipient Two' },
    ]);
    expect(
      result.sharedWith.some((r) => r.employeeId === 'recipient-1'),
    ).toBe(false);
  });

  it('unshares a view from everyone when given an empty recipient list', async () => {
    prisma.savedView.findUnique.mockResolvedValue({
      ...viewRecord,
      shares: [{ recipientEmployeeId: 'recipient-1' }],
    });
    prisma.employee.count.mockResolvedValue(0);
    prisma.savedView.findUniqueOrThrow.mockResolvedValue({
      ...viewRecord,
      shares: [],
    });

    const result = await service.replaceShares('owner-1', 'view-1', {
      recipientEmployeeIds: [],
    });

    expect(prisma.savedViewShare.deleteMany).toHaveBeenCalledWith({
      where: { savedViewId: 'view-1' },
    });
    expect(prisma.savedViewShare.createMany).not.toHaveBeenCalled();
    expect(result.sharedWith).toEqual([]);
  });

  it('replaces shares for the owner', async () => {
    prisma.savedView.findUnique.mockResolvedValue(viewRecord);
    prisma.employee.count.mockResolvedValue(1);
    prisma.savedView.findUniqueOrThrow.mockResolvedValue({
      ...viewRecord,
      shares: [
        {
          recipientEmployeeId: 'recipient-1',
          recipientEmployee: { user: { name: 'Recipient User' } },
        },
      ],
    });

    const result = await service.replaceShares('owner-1', 'view-1', {
      recipientEmployeeIds: ['recipient-1'],
    });

    expect(prisma.savedViewShare.deleteMany).toHaveBeenCalledWith({
      where: { savedViewId: 'view-1' },
    });
    expect(prisma.savedViewShare.createMany).toHaveBeenCalled();
    expect(result.sharedWith).toEqual([
      { employeeId: 'recipient-1', name: 'Recipient User' },
    ]);
  });

  it('returns not found when the viewer cannot access the view', async () => {
    prisma.savedView.findUnique.mockResolvedValue(viewRecord);

    await expect(service.remove('stranger-1', 'view-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('marks ownerless views as not editable', async () => {
    prisma.savedView.findMany.mockResolvedValue([
      {
        ...viewRecord,
        ownerEmployeeId: null,
        ownerEmployee: null,
        shares: [
          {
            recipientEmployeeId: 'recipient-1',
            recipientEmployee: { user: { name: 'Recipient User' } },
          },
        ],
      },
    ]);

    const result = await service.listForViewer('recipient-1');

    expect(result[0].canEdit).toBe(false);
    expect(result[0].isOwner).toBe(false);
  });
});
