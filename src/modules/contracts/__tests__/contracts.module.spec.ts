import { Test, TestingModule } from '@nestjs/testing';
import { ContractsModule } from '../contracts.module';
import { AccessResolver } from '../access-resolver.contract';
import { FieldRegistry } from '../field-registry.contract';
import { FieldRegistryStub } from '../stubs/field-registry.stub';
import { ProjectAssignment } from '../project-assignment.contract';
import { ExternalIdentityMapping } from '../external-identity-mapping.contract';
import { ActionItemCreation } from '../action-item-creation.contract';
import { EmployeeDirectory } from '../employee-directory.contract';
import { CurrentUserProvider } from '../current-user-provider.contract';
import { PermissionChecker } from '../permission-checker.contract';
import { TimelineEventWriter } from '../timeline-event-writer.contract';

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

  it.each([[FieldRegistry, FieldRegistryStub]] as const)(
    'resolves %p to its Wave-0 stub',
    (token, StubClass) => {
      expect(module.get(token)).toBeInstanceOf(StubClass);
    },
  );

  it('leaves C7 unbound for the authentication module to implement', () => {
    expect(() => module.get(CurrentUserProvider)).toThrow();
  });

  it('leaves C1 unbound for the access module to implement', () => {
    expect(() => module.get(AccessResolver)).toThrow();
  });

  it('leaves C3 unbound for the access module to implement', () => {
    expect(() => module.get(ProjectAssignment)).toThrow();
  });

  it('leaves C4 unbound for the timeline module to implement', () => {
    expect(() => module.get(TimelineEventWriter)).toThrow();
  });

  it('leaves C6 unbound for the action-items module to implement', () => {
    expect(() => module.get(ActionItemCreation)).toThrow();
  });

  it('leaves EmployeeDirectory unbound for the directory module to implement', () => {
    expect(() => module.get(EmployeeDirectory)).toThrow();
  });

  it('leaves C5 unbound for the integrations module to implement', () => {
    expect(() => module.get(ExternalIdentityMapping)).toThrow();
  });

  it('leaves C8 unbound for the access module to implement', () => {
    expect(() => module.get(PermissionChecker)).toThrow();
  });
});
