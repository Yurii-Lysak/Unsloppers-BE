import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { ProjectAssignment } from '../../contracts/project-assignment.contract';
import { ProjectsSectionProvider } from '../projects-section.provider';

const fullAssignment = {
  employeeId: 'emp-1',
  projectId: 'proj-1',
  pmId: 'pm-1',
  dmId: 'dm-1',
  startDate: '2026-01-01',
  endDate: null,
  confirmed: true,
  confirmedAt: '2026-01-01T00:00:00.000Z',
};

describe('ProjectsSectionProvider', () => {
  let provider: ProjectsSectionProvider;
  const projectAssignment = {
    listByEmployee: jest.fn(),
  };
  const prisma = {
    employee: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    projectAssignment.listByEmployee.mockResolvedValue([fullAssignment]);
    prisma.employee.findMany.mockResolvedValue([
      {
        id: 'pm-1',
        user: { name: 'Pat Manager', email: 'pm@example.com' },
      },
      {
        id: 'dm-1',
        user: { name: null, email: 'dm@example.com' },
      },
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsSectionProvider,
        { provide: ProjectAssignment, useValue: projectAssignment },
        { provide: PrismaService, useValue: prisma },
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
    expect(prisma.employee.findMany).not.toHaveBeenCalled();
  });

  it('returns enriched projects for Self viewers', async () => {
    const section = await provider.getSection('viewer', 'subject', {
      role: 'Self',
      sections: { S11: 'R' } as never,
    });

    expect(section.projects).toEqual([
      {
        name: 'proj-1',
        pm: 'Pat Manager',
        dm: 'dm@example.com',
        startDate: '2026-01-01',
        endDate: null,
      },
    ]);
    expect(prisma.employee.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['pm-1', 'dm-1'] } },
      include: { user: { select: { name: true, email: true } } },
    });
  });

  it('returns enriched projects for ReportingLine viewers', async () => {
    const section = await provider.getSection('viewer', 'subject', {
      role: 'ReportingLine',
      sections: { S11: 'R' } as never,
    });

    expect(section.projects[0]).toMatchObject({
      name: 'proj-1',
      pm: 'Pat Manager',
      dm: 'dm@example.com',
    });
  });

  it('returns enriched projects for PP viewers', async () => {
    const section = await provider.getSection('viewer', 'subject', {
      role: 'PP',
      sections: { S11: 'R' } as never,
    });

    expect(section.projects[0]).toMatchObject({
      name: 'proj-1',
      pm: 'Pat Manager',
      dm: 'dm@example.com',
    });
  });

  it('returns enriched projects for ProjectLine viewers', async () => {
    const section = await provider.getSection('viewer', 'subject', {
      role: 'ProjectLine',
      sections: { S11: 'R' } as never,
    });

    expect(section.projects[0]).toMatchObject({
      name: 'proj-1',
      pm: 'Pat Manager',
      dm: 'dm@example.com',
    });
  });

  it('returns name-only projects when audience is omitted', async () => {
    const section = await provider.getSection('viewer', 'subject');

    expect(section.projects[0]).toEqual({ name: 'proj-1' });
    expect(prisma.employee.findMany).not.toHaveBeenCalled();
  });

  it('preserves startDate ascending order from listByEmployee', async () => {
    projectAssignment.listByEmployee.mockResolvedValue([
      fullAssignment,
      {
        ...fullAssignment,
        projectId: 'proj-later',
        startDate: '2026-06-01',
      },
    ]);

    const section = await provider.getSection('viewer', 'subject', {
      role: 'Self',
      sections: { S11: 'R' } as never,
    });

    expect(section.projects.map((project) => project.name)).toEqual([
      'proj-1',
      'proj-later',
    ]);
  });

  it('nulls pm/dm when employee ids no longer resolve', async () => {
    prisma.employee.findMany.mockResolvedValue([]);

    const section = await provider.getSection('viewer', 'subject', {
      role: 'Self',
      sections: { S11: 'R' } as never,
    });

    expect(section.projects[0]).toMatchObject({
      pm: null,
      dm: null,
    });
  });

  it('omits unconfirmed and ended assignments', async () => {
    projectAssignment.listByEmployee.mockResolvedValue([
      {
        ...fullAssignment,
        projectId: 'ended',
        endDate: '2020-01-01',
      },
      {
        ...fullAssignment,
        projectId: 'unconfirmed',
        confirmed: false,
      },
      fullAssignment,
    ]);

    const section = await provider.getSection('viewer', 'subject', {
      role: 'Self',
      sections: { S11: 'R' } as never,
    });

    expect(section.projects).toHaveLength(1);
    expect(section.projects[0].name).toBe('proj-1');
  });
});
