import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { CampaignsService } from '../campaigns.service';

type PrismaMock = {
  formCampaign: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    updateMany: jest.Mock;
  };
};

describe('CampaignsService', () => {
  let service: CampaignsService;
  const prisma: PrismaMock = {
    formCampaign: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
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
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: PrismaService, useValue: prisma },
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
});
