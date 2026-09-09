import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { CampaignsDashboardSummaryProvider } from '../campaigns-dashboard-summary.provider';

describe('CampaignsDashboardSummaryProvider', () => {
  let provider: CampaignsDashboardSummaryProvider;
  let prisma: { formCampaign: { count: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      formCampaign: {
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsDashboardSummaryProvider,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    provider = module.get(CampaignsDashboardSummaryProvider);
  });

  it('counts active campaigns created by the viewer', async () => {
    prisma.formCampaign.count.mockResolvedValue(3);

    const result = await provider.getSummary('creator-1');

    expect(prisma.formCampaign.count).toHaveBeenCalledWith({
      where: {
        creatorId: 'creator-1',
        status: 'active',
      },
    });
    expect(result).toEqual({
      providerId: 'campaigns',
      status: 'available',
      openCount: 3,
    });
  });

  it('returns unavailable when prisma throws', async () => {
    prisma.formCampaign.count.mockRejectedValue(new Error('db down'));

    const result = await provider.getSummary('creator-1');

    expect(result).toEqual({
      providerId: 'campaigns',
      status: 'unavailable',
    });
  });
});
