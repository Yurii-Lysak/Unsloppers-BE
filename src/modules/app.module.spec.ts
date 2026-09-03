import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { AccessResolver } from './contracts/access-resolver.contract';
import { FieldRegistry } from './contracts/field-registry.contract';
import { ProjectAssignment } from './contracts/project-assignment.contract';
import { PermissionChecker } from './contracts/permission-checker.contract';
import { AccessResolverService } from './access/access-resolver.service';
import { FieldRegistryService } from './directory/field-registry.service';
import { ProjectAssignmentService } from './access/project-assignment.service';
import { PermissionCheckerService } from './access/permission-checker.service';
import {
  PROJECTS_SYNC_CRON,
  ProjectsSyncScheduler,
} from './integrations/projects-sync.scheduler';
import { ProjectsSyncService } from './integrations/projects-sync.service';

/**
 * Boots the real `AppModule` wiring (not a hand-built test module) so a
 * botched or skipped `ContractsModule`/`AccessModule` binding change is
 * caught even though a `ContractsModule`-only test can't see it — C1 must
 * resolve through the real module graph to `AccessResolverService`, never
 * fall back to the retired `AccessResolverStub`. Story 1.2 extends this to
 * C3, mirroring the same binding move. Story 1.4 extends to C8.
 */
describe('AppModule', () => {
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
  });

  afterAll(async () => {
    await module.close();
  });

  it('resolves C1 AccessResolver to AccessResolverService, not a stale stub', () => {
    expect(module.get(AccessResolver)).toBeInstanceOf(AccessResolverService);
  });

  it('resolves C2 FieldRegistry to FieldRegistryService, not the Wave-0 stub', () => {
    expect(module.get(FieldRegistry)).toBeInstanceOf(FieldRegistryService);
  });

  it('resolves C3 ProjectAssignment to ProjectAssignmentService, not the retired stub', () => {
    expect(module.get(ProjectAssignment)).toBeInstanceOf(
      ProjectAssignmentService,
    );
  });

  it('resolves C8 PermissionChecker to PermissionCheckerService, not the retired stub', () => {
    expect(module.get(PermissionChecker)).toBeInstanceOf(
      PermissionCheckerService,
    );
  });

  it('wires the TimeTracker project writer and scheduler in the production module graph', () => {
    expect(module.get(ProjectsSyncService)).toBeInstanceOf(ProjectsSyncService);
    expect(module.get(ProjectsSyncScheduler)).toBeInstanceOf(
      ProjectsSyncScheduler,
    );
  });

  it('registers the 15-minute project sync cron when the production graph initializes', async () => {
    const cronMetadata = Reflect.getMetadata(
      'SCHEDULE_CRON_OPTIONS',
      // eslint-disable-next-line @typescript-eslint/unbound-method
      ProjectsSyncScheduler.prototype.handleScheduledSync,
    ) as { cronTime: string } | undefined;
    expect(cronMetadata?.cronTime).toBe(PROJECTS_SYNC_CRON);

    const projectsSync = {
      sync: jest.fn().mockResolvedValue({ status: 'succeeded' }),
    };
    const initializedModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ProjectsSyncService)
      .useValue(projectsSync)
      .compile();
    const app: INestApplication = initializedModule.createNestApplication();

    try {
      await initializedModule
        .get(ProjectsSyncScheduler)
        .onApplicationBootstrap();
      expect(projectsSync.sync).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
});
