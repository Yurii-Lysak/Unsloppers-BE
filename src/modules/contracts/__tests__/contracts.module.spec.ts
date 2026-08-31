import { Test, TestingModule } from '@nestjs/testing';
import { ContractsModule } from '../contracts.module';
import { AccessResolver } from '../access-resolver.contract';
import { AccessResolverStub } from '../stubs/access-resolver.stub';
import { FieldRegistry } from '../field-registry.contract';
import { FieldRegistryStub } from '../stubs/field-registry.stub';
import { ProjectAssignment } from '../project-assignment.contract';
import { ProjectAssignmentStub } from '../stubs/project-assignment.stub';
import { TimelineEventWriter } from '../timeline-event-writer.contract';
import { TimelineEventWriterStub } from '../stubs/timeline-event-writer.stub';
import { ExternalIdentityMapping } from '../external-identity-mapping.contract';
import { ExternalIdentityMappingStub } from '../stubs/external-identity-mapping.stub';
import { ActionItemCreation } from '../action-item-creation.contract';
import { ActionItemCreationStub } from '../stubs/action-item-creation.stub';
import { CurrentUserProvider } from '../current-user-provider.contract';
import { PermissionChecker } from '../permission-checker.contract';
import { PermissionCheckerStub } from '../stubs/permission-checker.stub';

describe('ContractsModule', () => {
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [ContractsModule],
    }).compile();
  });

  afterAll(async () => {
    await module.close();
  });

  it.each([
    [AccessResolver, AccessResolverStub],
    [FieldRegistry, FieldRegistryStub],
    [ProjectAssignment, ProjectAssignmentStub],
    [TimelineEventWriter, TimelineEventWriterStub],
    [ExternalIdentityMapping, ExternalIdentityMappingStub],
    [ActionItemCreation, ActionItemCreationStub],
    [PermissionChecker, PermissionCheckerStub],
  ] as const)('resolves %p to its Wave-0 stub', (token, StubClass) => {
    expect(module.get(token)).toBeInstanceOf(StubClass);
  });

  it('leaves C7 unbound for the authentication module to implement', () => {
    expect(() => module.get(CurrentUserProvider)).toThrow();
  });

  it('AccessResolverStub denies every section by default', async () => {
    const resolver = module.get(AccessResolver);
    const result = await resolver.resolveAudience('viewer-1', 'subject-1');
    expect(Object.values(result.sections).every((v) => v === 'none')).toBe(
      true,
    );
  });

  it('PermissionCheckerStub denies every permission by default', async () => {
    const checker = module.get(PermissionChecker);
    await expect(
      checker.hasPermission('user-1', 'any:permission'),
    ).resolves.toBe(false);
  });
});
