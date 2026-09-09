import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Clock } from '../../../clock/clock.service';
import { TimetrackerClient } from '../../contracts/timetracker-client.contract';
import { TimetrackerApiError } from '../../contracts/timetracker.errors';
import { DayStatus } from '../../contracts/timetracker.types';
import { ExternalIdentityMappingService } from '../external-identity-mapping.service';
import { LeavesSyncService } from '../leaves-sync.service';

describe('LeavesSyncService', () => {
  let service: LeavesSyncService;
  let timetracker: jest.Mocked<TimetrackerClient>;
  let identityMapping: jest.Mocked<ExternalIdentityMappingService>;
  let clock: { now: jest.Mock };

  beforeEach(async () => {
    timetracker = {
      fetchAccountingReport: jest.fn(),
    };
    identityMapping = {
      findTimetrackerExternalId: jest.fn(),
    } as unknown as jest.Mocked<ExternalIdentityMappingService>;
    clock = {
      now: jest.fn(() => new Date('2026-09-01T12:00:00.000Z')),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeavesSyncService,
        { provide: TimetrackerClient, useValue: timetracker },
        { provide: ExternalIdentityMappingService, useValue: identityMapping },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'TIMETRACKER_ACCOUNTING_API_KEY' ? 'test-key' : undefined,
            ),
          },
        },
        { provide: Clock, useValue: clock },
      ],
    }).compile();

    service = module.get(LeavesSyncService);
  });

  it('serves last-known leave data with stale=true when refresh fails after cache expiry', async () => {
    identityMapping.findTimetrackerExternalId.mockResolvedValue('42');
    timetracker.fetchAccountingReport.mockResolvedValue({
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      employees: [
        {
          id: 42,
          email: 'emp@example.com',
          name: 'Employee',
          hash: 'hash',
          countryCode: 'US',
          days: [
            {
              date: '2026-09-05',
              projectId: 1,
              projectUniqueName: 'proj',
              project: 'Project',
              hours: 0,
              hoursForCustomer: 0,
              overtime: 0,
              overtimeRate: 0,
              outOfScope: 0,
              dayStatus: DayStatus.Vacation,
            },
          ],
        },
      ],
      dayStatuses: {},
      reportStates: {},
      dayApprovalStates: {},
    });

    const fresh = await service.getLeavesForEmployee('emp-1');
    expect(fresh.availability).toBe('ok');
    expect(fresh.stale).toBe(false);

    clock.now.mockReturnValue(new Date('2026-09-01T12:10:00.000Z'));
    timetracker.fetchAccountingReport.mockRejectedValue(
      new TimetrackerApiError('/accounting', 503),
    );

    const stale = await service.getLeavesForEmployee('emp-1');
    expect(stale.availability).toBe('ok');
    expect(stale.stale).toBe(true);
    expect(stale.leaves.length).toBeGreaterThanOrEqual(0);
  });
});
