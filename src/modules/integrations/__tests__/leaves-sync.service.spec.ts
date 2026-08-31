import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Clock } from '../../../clock/clock.service';
import { TimetrackerApiError } from '../../timetracker/timetracker.errors';
import { DayStatus } from '../../timetracker/timetracker.types';
import { TimetrackerService } from '../../timetracker/timetracker.service';
import { ExternalIdentityMappingService } from '../external-identity-mapping.service';
import { LeavesSyncService } from '../leaves-sync.service';

describe('LeavesSyncService', () => {
  let service: LeavesSyncService;
  const timetracker = { fetchAccountingReport: jest.fn() };
  const identityMapping = { findTimetrackerExternalId: jest.fn() };
  const config = { get: jest.fn() };
  const clock = { now: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    clock.now.mockReturnValue(new Date('2026-08-31T12:00:00.000Z'));
    config.get.mockImplementation((key: string) => {
      if (key === 'TIMETRACKER_ACCOUNTING_API_KEY') {
        return 'accounting-key';
      }
      return undefined;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeavesSyncService,
        { provide: TimetrackerService, useValue: timetracker },
        {
          provide: ExternalIdentityMappingService,
          useValue: identityMapping,
        },
        { provide: ConfigService, useValue: config },
        { provide: Clock, useValue: clock },
      ],
    }).compile();

    service = module.get(LeavesSyncService);
    service.clearCache();
  });

  it('returns empty leaves when no timetracker mapping exists', async () => {
    identityMapping.findTimetrackerExternalId.mockResolvedValue(null);

    await expect(service.getLeavesForEmployee('employee-1')).resolves.toEqual({
      availability: 'ok',
      leaves: [],
    });
  });

  it('returns unavailable when the accounting API key is unset', async () => {
    identityMapping.findTimetrackerExternalId.mockResolvedValue('42');
    config.get.mockReturnValue(undefined);

    await expect(service.getLeavesForEmployee('employee-1')).resolves.toEqual({
      availability: 'unavailable',
      leaves: [],
    });
  });

  it('normalizes vacation periods from the accounting report', async () => {
    identityMapping.findTimetrackerExternalId.mockResolvedValue('42');
    timetracker.fetchAccountingReport.mockResolvedValue({
      employees: [
        {
          id: 42,
          email: 'b@example.com',
          name: 'B',
          hash: 'hash',
          countryCode: 'US',
          days: [
            {
              date: '2026-08-25',
              projectId: 1,
              projectUniqueName: 'p',
              project: 'P',
              hours: 0,
              hoursForCustomer: 0,
              overtime: 0,
              overtimeRate: 0,
              outOfScope: 0,
              dayStatus: DayStatus.Vacation,
            },
            {
              date: '2026-08-26',
              projectId: 1,
              projectUniqueName: 'p',
              project: 'P',
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
    });

    await expect(service.getLeavesForEmployee('employee-1')).resolves.toEqual({
      availability: 'ok',
      leaves: [
        {
          type: 'vacation',
          startDate: '2026-08-25',
          endDate: '2026-08-26',
          approvalState: 'unknown',
        },
      ],
    });
    expect(timetracker.fetchAccountingReport).toHaveBeenCalled();
  });

  it('returns unavailable when TimeTracker is unreachable', async () => {
    identityMapping.findTimetrackerExternalId.mockResolvedValue('42');
    timetracker.fetchAccountingReport.mockRejectedValue(
      new TimetrackerApiError('POST /api/accounting/report'),
    );

    await expect(service.getLeavesForEmployee('employee-1')).resolves.toEqual({
      availability: 'unavailable',
      leaves: [],
    });
  });
});
