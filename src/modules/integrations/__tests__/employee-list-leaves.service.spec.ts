import { Test, TestingModule } from '@nestjs/testing';
import { Clock } from '../../../clock/clock.service';
import { EmployeeListLeavesService } from '../employee-list-leaves.service';
import { LeavesSyncService } from '../leaves-sync.service';

describe('EmployeeListLeavesService', () => {
  let service: EmployeeListLeavesService;
  let leavesSync: jest.Mocked<LeavesSyncService>;

  beforeEach(async () => {
    leavesSync = {
      getLeavesForEmployee: jest.fn(),
    } as unknown as jest.Mocked<LeavesSyncService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeeListLeavesService,
        { provide: LeavesSyncService, useValue: leavesSync },
        {
          provide: Clock,
          useValue: {
            now: jest.fn(() => new Date('2026-09-05T12:00:00.000Z')),
          },
        },
      ],
    }).compile();

    service = module.get(EmployeeListLeavesService);
  });

  it('propagates stale from leaves sync into the list cell', async () => {
    leavesSync.getLeavesForEmployee.mockResolvedValue({
      availability: 'ok',
      leaves: [{ startDate: '2026-09-01', endDate: '2026-09-10' }],
      stale: true,
    });

    const cell = await service.formatListCell('emp-1', false);

    expect(cell.unavailable).toBe(false);
    expect(cell.stale).toBe(true);
    expect(cell.value).toContain('2026-09-01');
  });
});
