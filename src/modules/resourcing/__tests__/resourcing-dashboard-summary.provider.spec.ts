import { Test, TestingModule } from '@nestjs/testing';
import { ResourcingDashboardSummaryProvider } from '../resourcing-dashboard-summary.provider';
import { ResourcingService } from '../resourcing.service';

describe('ResourcingDashboardSummaryProvider', () => {
  let provider: ResourcingDashboardSummaryProvider;
  const resourcing = {
    listAssigned: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourcingDashboardSummaryProvider,
        { provide: ResourcingService, useValue: resourcing },
      ],
    }).compile();

    provider = module.get(ResourcingDashboardSummaryProvider);
  });

  it('counts open assigned requests for the viewer', async () => {
    resourcing.listAssigned.mockResolvedValue([
      { id: 'req-1', status: 'open' },
      { id: 'req-2', status: 'fulfilled' },
      { id: 'req-3', status: 'open' },
    ]);

    const result = await provider.getSummary('um-viewer');

    expect(resourcing.listAssigned).toHaveBeenCalledWith('um-viewer');
    expect(result).toEqual({
      providerId: 'resourcing',
      status: 'available',
      openCount: 2,
    });
  });

  it('returns zero when viewer has no open assigned requests', async () => {
    resourcing.listAssigned.mockResolvedValue([
      { id: 'req-1', status: 'fulfilled' },
    ]);

    const result = await provider.getSummary('um-viewer');

    expect(result).toEqual({
      providerId: 'resourcing',
      status: 'available',
      openCount: 0,
    });
  });

  it('returns unavailable when listAssigned throws', async () => {
    resourcing.listAssigned.mockRejectedValue(new Error('service down'));

    const result = await provider.getSummary('um-viewer');

    expect(result).toEqual({
      providerId: 'resourcing',
      status: 'unavailable',
    });
  });
});
