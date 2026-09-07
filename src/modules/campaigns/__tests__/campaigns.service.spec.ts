import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { Clock } from '../../../clock/clock.service';
import { ActionItemCreation } from '../../contracts/action-item-creation.contract';
import { EmployeeDirectory } from '../../contracts/employee-directory.contract';
import type { EmployeeListQueryOptions } from '../../contracts/field-registry.contract';
import { CampaignsService } from '../campaigns.service';

type PrismaMock = {
  formCampaign: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    updateMany: jest.Mock;
  };
  employee: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
  };
  actionItem: {
    findMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

describe('CampaignsService', () => {
  let service: CampaignsService;
  const employeeDirectory = {
    listEmployees: jest.fn(),
  };
  const clock: Clock = {
    now: () => new Date('2026-01-05T09:00:00.000Z'),
    nowMs: () => new Date('2026-01-05T09:00:00.000Z').getTime(),
  };
  const prisma: PrismaMock = {
    formCampaign: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    employee: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    actionItem: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(
      (callback: (client: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
    ),
  };
  const actionItemCreation = {
    createActionItem: jest.fn(),
    createCampaignActionItems: jest.fn(),
  };

  const creatorInclude = {
    creator: {
      include: {
        user: { select: { name: true, email: true } },
      },
    },
  };

  const validPayload = {
    title: '  Annual Engagement Survey  ',
    description: '  Short description  ',
    purpose: '  Understand engagement trends  ',
    link: '  https://forms.example.com/survey  ',
    dueDate: '2026-09-15',
  };

  const draftCampaignRow = (
    overrides: Partial<Record<string, unknown>> = {},
  ) => ({
    id: 'campaign-1',
    creatorId: 'creator-1',
    title: 'Annual Engagement Survey',
    description: 'Short description',
    purpose: 'Understand engagement trends',
    link: 'https://forms.example.com/survey',
    dueDate: new Date('2026-09-15T00:00:00.000Z'),
    status: 'draft',
    audienceFilters: [],
    audienceAddedEmployeeIds: [],
    audienceExcludedEmployeeIds: [],
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    updatedAt: new Date('2026-09-01T10:00:00.000Z'),
    creator: {
      id: 'creator-1',
      user: { name: 'People Partner', email: 'pp@example.com' },
    },
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.employee.findUnique.mockResolvedValue({ userId: 'user-1' });
    employeeDirectory.listEmployees.mockResolvedValue({
      fields: [],
      rows: [],
      total: 0,
      page: 1,
      pageSize: 50,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EmployeeDirectory, useValue: employeeDirectory },
        { provide: ActionItemCreation, useValue: actionItemCreation },
        { provide: Clock, useValue: clock },
      ],
    }).compile();

    service = module.get(CampaignsService);
  });

  describe('createCampaign', () => {
    it('persists a normalized, trimmed draft campaign', async () => {
      prisma.formCampaign.create.mockResolvedValue(draftCampaignRow());

      const result = await service.createCampaign('creator-1', validPayload);

      expect(prisma.formCampaign.create).toHaveBeenCalledWith({
        data: {
          creatorId: 'creator-1',
          title: 'Annual Engagement Survey',
          description: 'Short description',
          purpose: 'Understand engagement trends',
          link: 'https://forms.example.com/survey',
          dueDate: new Date('2026-09-15T00:00:00.000Z'),
          status: 'draft',
        },
        include: creatorInclude,
      });
      expect(result).toMatchObject({
        id: 'campaign-1',
        title: 'Annual Engagement Survey',
        status: 'draft',
        dueDate: '2026-09-15',
        creator: { id: 'creator-1', displayName: 'People Partner' },
      });
    });

    it('rejects a missing link', async () => {
      await expect(
        service.createCampaign('creator-1', { ...validPayload, link: '' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an invalid dueDate', async () => {
      await expect(
        service.createCampaign('creator-1', {
          ...validPayload,
          dueDate: 'not-a-date',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a title over 200 characters', async () => {
      await expect(
        service.createCampaign('creator-1', {
          ...validPayload,
          title: 'x'.repeat(201),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a non-URL link', async () => {
      await expect(
        service.createCampaign('creator-1', {
          ...validPayload,
          link: 'not-a-url',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it.each([
      'javascript:alert(1)',
      'mailto:someone@example.com',
      'ftp://example.com/form',
    ])('rejects a link with a disallowed protocol (%s)', async (link) => {
      await expect(
        service.createCampaign('creator-1', { ...validPayload, link }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('listForCreator', () => {
    it('lists only the creator-scoped campaigns, newest first', async () => {
      prisma.formCampaign.findMany.mockResolvedValue([draftCampaignRow()]);

      const result = await service.listForCreator('creator-1');

      expect(prisma.formCampaign.findMany).toHaveBeenCalledWith({
        where: { creatorId: 'creator-1' },
        include: creatorInclude,
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('campaign-1');
    });
  });

  describe('getForCreator', () => {
    it('returns the campaign when owned by the viewer', async () => {
      prisma.formCampaign.findFirst.mockResolvedValue(draftCampaignRow());

      const result = await service.getForCreator('campaign-1', 'creator-1');

      expect(prisma.formCampaign.findFirst).toHaveBeenCalledWith({
        where: { id: 'campaign-1', creatorId: 'creator-1' },
        include: creatorInclude,
      });
      expect(result.id).toBe('campaign-1');
    });

    it('throws 404 when the campaign exists but is not owned by the viewer', async () => {
      prisma.formCampaign.findFirst.mockResolvedValue(null);

      await expect(
        service.getForCreator('campaign-1', 'someone-else'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateDraft', () => {
    it('saves a partial update while the campaign is draft', async () => {
      prisma.formCampaign.findFirst
        .mockResolvedValueOnce(draftCampaignRow())
        .mockResolvedValueOnce(draftCampaignRow({ title: 'Updated Title' }));
      prisma.formCampaign.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.updateDraft('campaign-1', 'creator-1', {
        title: '  Updated Title  ',
      });

      expect(prisma.formCampaign.updateMany).toHaveBeenCalledWith({
        where: { id: 'campaign-1', status: 'draft' },
        data: { title: 'Updated Title' },
      });
      expect(result.title).toBe('Updated Title');
    });

    it('throws 404 for a non-owned campaign, without attempting the write', async () => {
      prisma.formCampaign.findFirst.mockResolvedValue(null);

      await expect(
        service.updateDraft('campaign-1', 'someone-else', { title: 'New' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.formCampaign.updateMany).not.toHaveBeenCalled();
    });

    it('throws 409 when the conditional update matches no draft row (TOCTOU-safe)', async () => {
      // Ownership check passes (row exists and is owned)...
      prisma.formCampaign.findFirst.mockResolvedValue(draftCampaignRow());
      // ...but the atomic `status: 'draft'` precondition no longer matches —
      // e.g. a concurrent activation raced this PATCH.
      prisma.formCampaign.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.updateDraft('campaign-1', 'creator-1', { title: 'New' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.formCampaign.updateMany).toHaveBeenCalledWith({
        where: { id: 'campaign-1', status: 'draft' },
        data: { title: 'New' },
      });
    });
  });

  describe('saveAudience', () => {
    const employeeA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const employeeB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    it('persists a normalized audience on a draft campaign', async () => {
      prisma.formCampaign.findFirst
        .mockResolvedValueOnce(draftCampaignRow())
        .mockResolvedValueOnce(
          draftCampaignRow({
            audienceFilters: [
              { fieldId: 'department', operator: 'eq', value: 'Engineering' },
            ],
            audienceAddedEmployeeIds: [employeeB],
            audienceExcludedEmployeeIds: [employeeA],
          }),
        );
      employeeDirectory.listEmployees.mockImplementation(
        (_userId: string, query?: EmployeeListQueryOptions) => {
          if (query?.filters?.length) {
            return Promise.resolve({
              fields: [],
              rows: [{ employeeId: employeeA, cells: {} }],
              total: 1,
              page: 1,
              pageSize: 100,
            });
          }
          return Promise.resolve({
            fields: [],
            rows: [
              { employeeId: employeeA, cells: {} },
              { employeeId: employeeB, cells: {} },
            ],
            total: 2,
            page: 1,
            pageSize: 100,
          });
        },
      );
      prisma.employee.findMany.mockResolvedValue([{ id: employeeB }]);
      prisma.formCampaign.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.saveAudience('campaign-1', 'creator-1', {
        filters: [
          { fieldId: 'department', operator: 'eq', value: 'Engineering' },
        ],
        addedEmployeeIds: [employeeB],
        excludedEmployeeIds: [employeeA],
      });

      expect(prisma.formCampaign.updateMany).toHaveBeenCalledWith({
        where: { id: 'campaign-1', status: 'draft' },
        data: {
          audienceFilters: [
            { fieldId: 'department', operator: 'eq', value: 'Engineering' },
          ],
          audienceAddedEmployeeIds: [employeeB],
          audienceExcludedEmployeeIds: [employeeA],
        },
      });
      expect(result.audience.addedEmployeeIds).toEqual([employeeB]);
    });

    it('rejects excluded ids that are not filter matches', async () => {
      prisma.formCampaign.findFirst.mockResolvedValue(draftCampaignRow());
      employeeDirectory.listEmployees.mockResolvedValue({
        fields: [],
        rows: [],
        total: 0,
        page: 1,
        pageSize: 100,
      });

      await expect(
        service.saveAudience('campaign-1', 'creator-1', {
          filters: [],
          addedEmployeeIds: [],
          excludedEmployeeIds: [employeeA],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects duplicate added employee ids', async () => {
      prisma.formCampaign.findFirst.mockResolvedValue(draftCampaignRow());

      await expect(
        service.saveAudience('campaign-1', 'creator-1', {
          filters: [],
          addedEmployeeIds: [employeeA, employeeA],
          excludedEmployeeIds: [],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects inactive or invisible added employee ids', async () => {
      prisma.formCampaign.findFirst.mockResolvedValue(draftCampaignRow());
      prisma.employee.findUnique.mockResolvedValue({ userId: 'user-1' });
      employeeDirectory.listEmployees.mockResolvedValue({
        fields: [],
        rows: [{ employeeId: employeeA, cells: {} }],
        total: 1,
        page: 1,
        pageSize: 100,
      });
      prisma.employee.findMany.mockResolvedValue([]);

      await expect(
        service.saveAudience('campaign-1', 'creator-1', {
          filters: [],
          addedEmployeeIds: [employeeB],
          excludedEmployeeIds: [],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('resolveAudienceEmployeeIds', () => {
    const employeeA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const employeeB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    it('returns the resolved audience for a draft campaign', async () => {
      prisma.formCampaign.findFirst.mockResolvedValue(
        draftCampaignRow({
          audienceFilters: [
            { fieldId: 'department', operator: 'eq', value: 'Engineering' },
          ],
          audienceAddedEmployeeIds: [employeeB],
          audienceExcludedEmployeeIds: [employeeA],
        }),
      );
      employeeDirectory.listEmployees.mockResolvedValue({
        fields: [],
        rows: [
          { employeeId: employeeA, cells: {} },
          { employeeId: employeeB, cells: {} },
        ],
        total: 2,
        page: 1,
        pageSize: 100,
      });

      const result = await service.resolveAudienceEmployeeIds(
        'campaign-1',
        'creator-1',
      );

      expect(result).toEqual([employeeB]);
    });
  });

  describe('activateCampaign', () => {
    const employeeA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const employeeB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    it('flips the campaign to active and calls C6 with a fresh in-transaction read, not the pre-transaction snapshot', async () => {
      prisma.formCampaign.findFirst
        // Ownership/audience-definition read, before the transaction opens.
        .mockResolvedValueOnce(
          draftCampaignRow({
            audienceAddedEmployeeIds: [employeeA, employeeB],
          }),
        )
        // Re-fetch inside the transaction — simulates a concurrent PATCH
        // that landed between the outer read and this commit; the C6
        // payload must reflect these (changed) field values, not the ones
        // from the first mock above.
        .mockResolvedValueOnce(
          draftCampaignRow({
            title: 'Updated Mid-Flight',
            description: 'Updated description',
            link: 'https://forms.example.com/updated',
            dueDate: new Date('2026-10-01T00:00:00.000Z'),
            audienceAddedEmployeeIds: [employeeA, employeeB],
          }),
        )
        // Final read for the response DTO, after the transaction commits.
        .mockResolvedValueOnce(
          draftCampaignRow({
            status: 'active',
            title: 'Updated Mid-Flight',
            audienceAddedEmployeeIds: [employeeA, employeeB],
          }),
        );
      prisma.formCampaign.updateMany.mockResolvedValue({ count: 1 });
      actionItemCreation.createCampaignActionItems.mockResolvedValue([]);

      const result = await service.activateCampaign('campaign-1', 'creator-1');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.formCampaign.updateMany).toHaveBeenCalledWith({
        where: { id: 'campaign-1', status: 'draft' },
        data: { status: 'active' },
      });
      expect(actionItemCreation.createCampaignActionItems).toHaveBeenCalledWith(
        {
          campaignId: 'campaign-1',
          authorId: 'creator-1',
          title: 'Updated Mid-Flight',
          description: 'Updated description',
          dueDate: '2026-10-01',
          link: 'https://forms.example.com/updated',
          assigneeIds: [employeeA, employeeB],
        },
        prisma,
      );
      expect(result.status).toBe('active');
    });

    it('allows activation with an empty resolved audience', async () => {
      prisma.formCampaign.findFirst
        .mockResolvedValueOnce(draftCampaignRow())
        .mockResolvedValueOnce(draftCampaignRow())
        .mockResolvedValueOnce(draftCampaignRow({ status: 'active' }));
      prisma.formCampaign.updateMany.mockResolvedValue({ count: 1 });
      actionItemCreation.createCampaignActionItems.mockResolvedValue([]);

      const result = await service.activateCampaign('campaign-1', 'creator-1');

      expect(actionItemCreation.createCampaignActionItems).toHaveBeenCalledWith(
        expect.objectContaining({ assigneeIds: [] }),
        prisma,
      );
      expect(result.status).toBe('active');
    });

    it('throws 404 for a non-owned campaign without touching the transaction', async () => {
      prisma.formCampaign.findFirst.mockResolvedValue(null);

      await expect(
        service.activateCampaign('campaign-1', 'someone-else'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws 409 with an activation-specific message when the campaign is already active', async () => {
      prisma.formCampaign.findFirst.mockResolvedValue(
        draftCampaignRow({ status: 'active' }),
      );

      await expect(
        service.activateCampaign('campaign-1', 'creator-1'),
      ).rejects.toMatchObject({
        response: { message: 'Only draft campaigns can be activated' },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws 409 and skips C6 when the atomic flip loses a concurrent race', async () => {
      prisma.formCampaign.findFirst.mockResolvedValue(draftCampaignRow());
      prisma.formCampaign.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.activateCampaign('campaign-1', 'creator-1'),
      ).rejects.toMatchObject({
        response: { message: 'Only draft campaigns can be activated' },
      });
      expect(
        actionItemCreation.createCampaignActionItems,
      ).not.toHaveBeenCalled();
    });

    it('propagates C6 rejection so the whole transaction rolls back', async () => {
      prisma.formCampaign.findFirst
        .mockResolvedValueOnce(
          draftCampaignRow({ audienceAddedEmployeeIds: [employeeA] }),
        )
        .mockResolvedValueOnce(
          draftCampaignRow({ audienceAddedEmployeeIds: [employeeA] }),
        );
      prisma.formCampaign.updateMany.mockResolvedValue({ count: 1 });
      actionItemCreation.createCampaignActionItems.mockRejectedValue(
        new BadRequestException({
          message: 'assigneeIds must reference active employees',
          invalidAssigneeIds: [employeeA],
        }),
      );

      await expect(
        service.activateCampaign('campaign-1', 'creator-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getCompletion', () => {
    const employeeA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const employeeB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const employeeC = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

    const completionItem = (
      overrides: Partial<Record<string, unknown>> = {},
    ) => ({
      id: 'action-item-1',
      assigneeId: employeeA,
      authorId: 'creator-1',
      title: 'Survey',
      description: null,
      dueDate: new Date('2025-12-31T00:00:00.000Z'),
      link: null,
      status: 'open',
      source: 'campaign',
      campaignId: 'campaign-1',
      completedAt: null,
      cancelledAt: null,
      cancelledReason: null,
      createdAt: new Date('2026-09-01T10:00:00.000Z'),
      updatedAt: new Date('2026-09-01T10:00:00.000Z'),
      assignee: {
        id: employeeA,
        user: { name: 'Zara Alpha', email: 'zara@example.com' },
      },
      ...overrides,
    });

    it('returns completion rows for an active campaign sorted by displayName then actionItemId', async () => {
      prisma.formCampaign.findFirst.mockResolvedValue(
        draftCampaignRow({ status: 'active' }),
      );
      prisma.actionItem.findMany.mockResolvedValue([
        completionItem({
          id: 'action-item-b',
          assigneeId: employeeB,
          assignee: {
            id: employeeB,
            user: { name: 'Mia Beta', email: 'mia@example.com' },
          },
          status: 'completed',
          completedAt: new Date('2026-01-02T12:00:00.000Z'),
        }),
        completionItem({
          id: 'action-item-a',
          assigneeId: employeeA,
          dueDate: new Date('2026-01-05T00:00:00.000Z'),
        }),
        completionItem({
          id: 'action-item-c',
          assigneeId: employeeC,
          assignee: {
            id: employeeC,
            user: { name: 'Mia Beta', email: 'mia.other@example.com' },
          },
          status: 'cancelled',
          dueDate: new Date('2025-12-01T00:00:00.000Z'),
        }),
      ]);

      const result = await service.getCompletion('campaign-1', 'creator-1');

      expect(prisma.actionItem.findMany).toHaveBeenCalledWith({
        where: { campaignId: 'campaign-1' },
        include: {
          assignee: {
            include: {
              user: { select: { name: true, email: true } },
            },
          },
        },
      });
      expect(result.recipients).toHaveLength(3);
      expect(result.recipients.map((row) => row.actionItemId)).toEqual([
        'action-item-b',
        'action-item-c',
        'action-item-a',
      ]);
      expect(result.recipients[0]).toMatchObject({
        status: 'completed',
        isOverdue: false,
        completedAt: '2026-01-02T12:00:00.000Z',
      });
      expect(result.recipients[1]).toMatchObject({
        status: 'cancelled',
        isOverdue: false,
      });
      expect(result.recipients[2]).toMatchObject({
        status: 'open',
        dueDate: '2026-01-05',
        isOverdue: false,
      });
    });

    it('falls back to email when assignee name is blank', async () => {
      prisma.formCampaign.findFirst.mockResolvedValue(
        draftCampaignRow({ status: 'active' }),
      );
      prisma.actionItem.findMany.mockResolvedValue([
        completionItem({
          assignee: {
            id: employeeA,
            user: { name: '   ', email: 'fallback@example.com' },
          },
        }),
      ]);

      const result = await service.getCompletion('campaign-1', 'creator-1');

      expect(result.recipients[0]?.assignee.displayName).toBe(
        'fallback@example.com',
      );
    });

    it('marks open past-due items as overdue', async () => {
      prisma.formCampaign.findFirst.mockResolvedValue(
        draftCampaignRow({ status: 'active' }),
      );
      prisma.actionItem.findMany.mockResolvedValue([
        completionItem({
          dueDate: new Date('2025-12-31T00:00:00.000Z'),
        }),
      ]);

      const result = await service.getCompletion('campaign-1', 'creator-1');

      expect(result.recipients[0]).toMatchObject({
        status: 'open',
        isOverdue: true,
      });
    });

    it('returns an empty recipient list for an active campaign with no action items', async () => {
      prisma.formCampaign.findFirst.mockResolvedValue(
        draftCampaignRow({ status: 'active' }),
      );
      prisma.actionItem.findMany.mockResolvedValue([]);

      const result = await service.getCompletion('campaign-1', 'creator-1');

      expect(result).toEqual({ recipients: [] });
    });

    it('rejects completion for draft campaigns', async () => {
      prisma.formCampaign.findFirst.mockResolvedValue(draftCampaignRow());

      await expect(
        service.getCompletion('campaign-1', 'creator-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.actionItem.findMany).not.toHaveBeenCalled();
    });

    it('returns 404 when the campaign is not owned by the creator', async () => {
      prisma.formCampaign.findFirst.mockResolvedValue(null);

      await expect(
        service.getCompletion('campaign-1', 'creator-2'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
