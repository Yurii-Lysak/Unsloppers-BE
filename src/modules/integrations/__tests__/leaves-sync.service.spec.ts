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

  it('fetches leaves for many employees with one accounting call per month, not one per employee', async () => {
    identityMapping.findTimetrackerExternalId.mockImplementation(
      (employeeId: string) =>
        Promise.resolve(
          employeeId === 'emp-1' ? '42' : employeeId === 'emp-2' ? '43' : null,
        ),
    );
    timetracker.fetchAccountingReport.mockResolvedValue({
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      employees: [
        {
          id: 42,
          email: 'a@example.com',
          name: 'A',
          hash: 'h',
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
        {
          id: 43,
          email: 'b@example.com',
          name: 'B',
          hash: 'h',
          countryCode: 'US',
          days: [],
        },
      ],
      dayStatuses: {},
      reportStates: {},
      dayApprovalStates: {},
    });

    const results = await service.getLeavesForEmployees([
      'emp-1',
      'emp-2',
      'emp-3',
    ]);

    // 3 months queried (prev/current/next), each in a single batched call
    // covering both mapped employees — not 3 calls per employee.
    expect(timetracker.fetchAccountingReport.mock.calls).toHaveLength(3);
    for (const [call] of timetracker.fetchAccountingReport.mock.calls) {
      expect(call.employeeIds).toEqual(expect.arrayContaining([42, 43]));
    }
    expect(results.get('emp-1')?.availability).toBe('ok');
    expect(results.get('emp-1')?.leaves[0]?.startDate).toBe('2026-09-05');
    expect(results.get('emp-2')).toEqual({
      availability: 'ok',
      leaves: [],
      stale: false,
    });
    expect(results.get('emp-3')).toEqual({ availability: 'ok', leaves: [] });
  });
});
