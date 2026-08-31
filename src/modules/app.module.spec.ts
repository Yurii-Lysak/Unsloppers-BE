import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { AccessResolver } from './contracts/access-resolver.contract';
import { AccessResolverService } from './access/access-resolver.service';
import { ProjectAssignment } from './contracts/project-assignment.contract';
import { ProjectAssignmentService } from './access/project-assignment.service';

/**
 * Boots the real `AppModule` wiring (not a hand-built test module) so a
 * botched or skipped `ContractsModule`/`AccessModule` binding change is
 * caught even though a `ContractsModule`-only test can't see it — C1 must
 * resolve through the real module graph to `AccessResolverService`, never
 * fall back to the retired `AccessResolverStub`. Story 1.2 extends this to
 * C3, mirroring the same binding move.
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

  it('resolves C3 ProjectAssignment to ProjectAssignmentService, not the retired stub', () => {
    expect(module.get(ProjectAssignment)).toBeInstanceOf(
      ProjectAssignmentService,
    );
  });
});
