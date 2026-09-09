import { Test, TestingModule } from '@nestjs/testing';
import { EmployeeListLeavesReader } from '../../contracts/employee-list-leaves.contract';
import { LeaveDashboardSummaryProvider } from '../leave-dashboard-summary.provider';

describe('LeaveDashboardSummaryProvider', () => {
  let provider: LeaveDashboardSummaryProvider;
  const leavesReader = {
    formatListCell: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaveDashboardSummaryProvider,
        { provide: EmployeeListLeavesReader, useValue: leavesReader },
      ],
    }).compile();

    provider = module.get(LeaveDashboardSummaryProvider);
  });

  it('returns empty cells when scope has no subject ids', async () => {
    const result = await provider.getSummary('viewer');

    expect(result).toEqual({
      providerId: 'leave',
      status: 'available',
      cells: {},
    });
    expect(leavesReader.formatListCell).not.toHaveBeenCalled();
  });

  it('maps leave cells including stale flag for each subject', async () => {
    leavesReader.formatListCell
      .mockResolvedValueOnce({
        value: 'On vacation',
        unavailable: false,
        stale: true,
      })
      .mockResolvedValueOnce({
        value: '—',
        unavailable: false,
      });

    const result = await provider.getSummary('viewer', {
      subjectIds: ['emp-1', 'emp-2'],
    });

    expect(leavesReader.formatListCell).toHaveBeenNthCalledWith(1, 'emp-1', false);
    expect(leavesReader.formatListCell).toHaveBeenNthCalledWith(2, 'emp-2', false);
    expect(result).toEqual({
      providerId: 'leave',
      status: 'available',
      cells: {
        'emp-1': { value: 'On vacation', unavailable: false, stale: true },
        'emp-2': { value: '—', unavailable: false, stale: false },
      },
    });
  });

  it('returns unavailable when leaves reader throws', async () => {
    leavesReader.formatListCell.mockRejectedValue(new Error('sync down'));

    const result = await provider.getSummary('viewer', {
      subjectIds: ['emp-1'],
    });

    expect(result).toEqual({
      providerId: 'leave',
      status: 'unavailable',
    });
  });
});
