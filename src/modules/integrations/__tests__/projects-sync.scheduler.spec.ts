import { Test } from '@nestjs/testing';
import {
  PROJECTS_SYNC_CRON,
  ProjectsSyncScheduler,
} from '../projects-sync.scheduler';
import { ProjectsSyncService } from '../projects-sync.service';

describe('ProjectsSyncScheduler', () => {
  const projectsSync = { sync: jest.fn() };
  let scheduler: ProjectsSyncScheduler;

  beforeEach(async () => {
    jest.clearAllMocks();
    projectsSync.sync.mockResolvedValue({ status: 'succeeded' });
    const module = await Test.createTestingModule({
      providers: [
        ProjectsSyncScheduler,
        { provide: ProjectsSyncService, useValue: projectsSync },
      ],
    }).compile();
    scheduler = module.get(ProjectsSyncScheduler);
  });

  it('uses an exact 15-minute cron cadence', () => {
    expect(PROJECTS_SYNC_CRON).toBe('0 */15 * * * *');
    const cronMetadata = Reflect.getMetadata(
      'SCHEDULE_CRON_OPTIONS',
      // Metadata is attached to the prototype method by Nest's decorator.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      ProjectsSyncScheduler.prototype.handleScheduledSync,
    ) as { cronTime: string } | undefined;
    expect(cronMetadata?.cronTime).toBe(PROJECTS_SYNC_CRON);
  });

  it('runs once after application bootstrap', async () => {
    await scheduler.onApplicationBootstrap();
    expect(projectsSync.sync).toHaveBeenCalledTimes(1);
  });

  it('delegates every scheduled tick to the overlap-guarded service', async () => {
    await scheduler.handleScheduledSync();
    expect(projectsSync.sync).toHaveBeenCalledTimes(1);
  });
});
