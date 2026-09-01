import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ProjectsSyncService } from './projects-sync.service';

export const PROJECTS_SYNC_CRON = '0 */15 * * * *';

@Injectable()
export class ProjectsSyncScheduler implements OnApplicationBootstrap {
  constructor(private readonly projectsSync: ProjectsSyncService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.projectsSync.sync();
  }

  @Cron(PROJECTS_SYNC_CRON)
  async handleScheduledSync(): Promise<void> {
    await this.projectsSync.sync();
  }
}
