import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AccessResolver } from '../../contracts/access-resolver.contract';
import { LeavesSectionProvider } from '../leaves-section.provider';
import { LeavesSyncService } from '../leaves-sync.service';

describe('LeavesSectionProvider', () => {
  let provider: LeavesSectionProvider;
  const accessResolver = { resolveAudience: jest.fn() };
  const leavesSync = {
    getLeavesForEmployee: jest.fn(),
    getManageLeaveUrl: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    leavesSync.getManageLeaveUrl.mockReturnValue(
      'https://tt.example.test/leaves',
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeavesSectionProvider,
        { provide: AccessResolver, useValue: accessResolver },
        { provide: LeavesSyncService, useValue: leavesSync },
      ],
    }).compile();

    provider = module.get(LeavesSectionProvider);
  });

  it('returns grouped leave data for entitled viewers', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'ReportingLine',
      sections: { S10: 'R' },
    });
    leavesSync.getLeavesForEmployee.mockResolvedValue({
      availability: 'ok',
      leaves: [
        {
          type: 'vacation',
          startDate: '2026-08-25',
          endDate: '2026-08-29',
          approvalState: 'approved',
        },
      ],
    });

    await expect(provider.getSection('viewer-1', 'subject-1')).resolves.toEqual(
      {
        availability: 'ok',
        manageLeaveUrl: null,
        leaves: [
          {
            type: 'vacation',
            startDate: '2026-08-25',
            endDate: '2026-08-29',
            approvalState: 'approved',
          },
        ],
      },
    );
  });

  it('hides leave type for Colleague viewers while keeping dates', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'Colleague',
      sections: { S10: 'R' },
    });
    leavesSync.getLeavesForEmployee.mockResolvedValue({
      availability: 'ok',
      leaves: [
        {
          type: 'vacation',
          startDate: '2026-08-25',
          endDate: '2026-08-29',
          approvalState: 'approved',
        },
      ],
    });

    await expect(provider.getSection('viewer-1', 'subject-1')).resolves.toEqual(
      {
        availability: 'ok',
        manageLeaveUrl: null,
        leaves: [
          {
            type: null,
            startDate: '2026-08-25',
            endDate: '2026-08-29',
            approvalState: null,
          },
        ],
      },
    );
  });

  it('returns unavailable without throwing when sync fails', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'ReportingLine',
      sections: { S10: 'R' },
    });
    leavesSync.getLeavesForEmployee.mockResolvedValue({
      availability: 'unavailable',
      leaves: [],
    });

    await expect(provider.getSection('viewer-1', 'subject-1')).resolves.toEqual(
      {
        availability: 'unavailable',
        manageLeaveUrl: null,
        leaves: [],
      },
    );
  });

  it('throws when S10 is denied', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'Colleague',
      sections: { S10: 'none' },
    });

    await expect(
      provider.getSection('viewer-1', 'subject-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('includes manageLeaveUrl for Self viewers', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'Self',
      sections: { S10: 'R' },
    });
    leavesSync.getLeavesForEmployee.mockResolvedValue({
      availability: 'ok',
      leaves: [],
    });

    await expect(
      provider.getSection('viewer-1', 'subject-1'),
    ).resolves.toMatchObject({
      manageLeaveUrl: 'https://tt.example.test/leaves',
    });
  });
});
