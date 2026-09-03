import { Test, TestingModule } from '@nestjs/testing';
import { ProjectAssignment } from '../../contracts/project-assignment.contract';
import { ProjectsSectionProvider } from '../projects-section.provider';

describe('ProjectsSectionProvider', () => {
  let provider: ProjectsSectionProvider;
  const projectAssignment = {
    listByEmployee: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    projectAssignment.listByEmployee.mockResolvedValue([
      { projectId: 'proj-1', pmId: 'pm-1', dmId: 'dm-1' },
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsSectionProvider,
        { provide: ProjectAssignment, useValue: projectAssignment },
      ],
    }).compile();

    provider = module.get(ProjectsSectionProvider);
  });

  it('returns name-only projects for Colleague viewers', async () => {
    const section = await provider.getSection('viewer', 'subject', {
      role: 'Colleague',
      sections: { S11: 'R' } as never,
    });

    expect(section).toEqual({ projects: [{ name: 'proj-1' }] });
    expect(section.projects[0]).not.toHaveProperty('pm');
  });
});
