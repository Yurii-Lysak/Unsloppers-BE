import { Test } from '@nestjs/testing';
import { ExternalIdentityMapping } from '../../contracts/external-identity-mapping.contract';
import {
  ProjectStatus,
  ProjectTalentDto,
  ProjectType,
  TimetrackerEmployee,
} from '../../contracts/timetracker.types';
import {
  ProjectAssignmentMapper,
  TimetrackerProjectsPayloadError,
} from '../project-assignment.mapper';

describe('ProjectAssignmentMapper', () => {
  const identityMapping = { findByExternalId: jest.fn() };
  let mapper: ProjectAssignmentMapper;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ProjectAssignmentMapper,
        { provide: ExternalIdentityMapping, useValue: identityMapping },
      ],
    }).compile();
    mapper = module.get(ProjectAssignmentMapper);
  });

  it('joins feed emails through the TimeTracker directory and C5', async () => {
    identityMapping.findByExternalId.mockImplementation(
      (_system: string, externalId: string) =>
        Promise.resolve({
          system: 'timetracker',
          externalId,
          employeeId: `platform-${externalId}`,
        }),
    );

    const result = await mapper.map([project()], directory());

    expect(result.assignments).toEqual([
      {
        sourceKey: 'timetracker:100:10',
        employeeId: 'platform-10',
        projectId: '100',
        pmId: 'platform-20',
        dmId: 'platform-30',
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: null,
      },
    ]);
    expect(result.omissions).toEqual({
      directoryMisses: 0,
      identityMisses: 0,
      duplicateAssignments: 0,
      omittedAssignments: 0,
    });
    expect(identityMapping.findByExternalId).toHaveBeenCalledWith(
      'timetracker',
      '10',
    );
  });

  it('omits assignments that cannot resolve through the directory or C5', async () => {
    identityMapping.findByExternalId.mockImplementation(
      (_system: string, externalId: string) =>
        Promise.resolve(
          externalId === '10'
            ? null
            : {
                system: 'timetracker',
                externalId,
                employeeId: `platform-${externalId}`,
              },
        ),
    );

    const result = await mapper.map(
      [
        project({
          members: [
            project().members[0],
            {
              email: 'mapped@example.test',
              dateStart: '2026-08-02T00:00:00.000Z',
              dateEnd: null,
            },
          ],
        }),
        project({
          id: 101,
          projectManager: 'unknown@example.test',
        }),
      ],
      [...directory(), employee(11, 'mapped@example.test')],
    );

    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0]).toMatchObject({
      sourceKey: 'timetracker:100:11',
      employeeId: 'platform-11',
    });
    expect(result.omissions).toMatchObject({
      directoryMisses: 1,
      identityMisses: 1,
      omittedAssignments: 2,
    });
  });

  it('maps Support projects as in-scope assignments', async () => {
    identityMapping.findByExternalId.mockImplementation(
      (_system: string, externalId: string) =>
        Promise.resolve({
          system: 'timetracker',
          externalId,
          employeeId: `platform-${externalId}`,
        }),
    );

    const result = await mapper.map(
      [project({ status: ProjectStatus.Support })],
      directory(),
    );

    expect(result.assignments).toHaveLength(1);
  });

  it('deduplicates an identical repeated source assignment deterministically', async () => {
    identityMapping.findByExternalId.mockImplementation(
      (_system: string, externalId: string) =>
        Promise.resolve({
          system: 'timetracker',
          externalId,
          employeeId: `platform-${externalId}`,
        }),
    );
    const member = project().members[0];

    const result = await mapper.map(
      [project({ members: [member, { ...member }] })],
      directory(),
    );

    expect(result.assignments).toHaveLength(1);
    expect(result.omissions).toEqual({
      directoryMisses: 0,
      identityMisses: 0,
      duplicateAssignments: 1,
      omittedAssignments: 0,
    });
  });

  it('rejects conflicting duplicates with a sanitized payload error', async () => {
    identityMapping.findByExternalId.mockImplementation(
      (_system: string, externalId: string) =>
        Promise.resolve({
          system: 'timetracker',
          externalId,
          employeeId: `platform-${externalId}`,
        }),
    );
    const member = project().members[0];

    const result = mapper.map(
      [
        project({
          members: [member, { ...member, dateEnd: '2026-08-31T00:00:00.000Z' }],
        }),
      ],
      directory(),
    );

    await expect(result).rejects.toEqual(new TimetrackerProjectsPayloadError());
  });

  it('rejects malformed projects, members, identifiers, IDs, dates, and statuses', async () => {
    const malformed = [
      project({ status: ProjectStatus.Draft }),
      project({ id: Number.MAX_SAFE_INTEGER + 1 }),
      project({ projectManager: 'sentinel-manager-value' }),
      project({
        members: [{ ...project().members[0], email: 'sentinel-member-value' }],
      }),
      project({
        members: [
          { ...project().members[0], dateStart: '2026-02-30T00:00:00Z' },
        ],
      }),
      project({
        members: [
          {
            ...project().members[0],
            dateStart: '2026-08-03T00:00:00Z',
            dateEnd: '2026-08-02T00:00:00Z',
          },
        ],
      }),
      project({ members: null as unknown as ProjectTalentDto['members'] }),
    ];

    for (const invalidProject of malformed) {
      const result = mapper.map([invalidProject], directory());
      await expect(result).rejects.toEqual(
        new TimetrackerProjectsPayloadError(),
      );
    }
  });

  it('rejects structurally invalid directory rows instead of counting omissions', async () => {
    const invalidDirectory = [
      employee(0, 'invalid-id@example.test'),
      employee(10, 'sentinel-directory-value'),
    ];

    for (const invalidEmployee of invalidDirectory) {
      await expect(mapper.map([project()], [invalidEmployee])).rejects.toEqual(
        new TimetrackerProjectsPayloadError(),
      );
    }
  });

  it('deduplicates repeated directory rows with the same email and external ID', async () => {
    identityMapping.findByExternalId.mockImplementation(
      (_system: string, externalId: string) =>
        Promise.resolve({
          system: 'timetracker',
          externalId,
          employeeId: `platform-${externalId}`,
        }),
    );

    const result = await mapper.map(
      [project()],
      [...directory(), employee(10, ' MEMBER@example.test ')],
    );

    expect(result.assignments).toHaveLength(1);
    expect(result.omissions.directoryMisses).toBe(0);
  });

  it('omits ambiguous normalized directory emails instead of choosing one identity', async () => {
    identityMapping.findByExternalId.mockImplementation(
      (_system: string, externalId: string) =>
        Promise.resolve({
          system: 'timetracker',
          externalId,
          employeeId: `platform-${externalId}`,
        }),
    );

    const result = await mapper.map(
      [project()],
      [...directory(), employee(11, ' MEMBER@example.test ')],
    );

    expect(result.assignments).toEqual([]);
    expect(result.omissions).toMatchObject({
      directoryMisses: 1,
      omittedAssignments: 1,
    });
  });

  it('preserves the source calendar date when a date-time has an offset', async () => {
    identityMapping.findByExternalId.mockImplementation(
      (_system: string, externalId: string) =>
        Promise.resolve({
          system: 'timetracker',
          externalId,
          employeeId: `platform-${externalId}`,
        }),
    );

    const result = await mapper.map(
      [
        project({
          members: [
            {
              ...project().members[0],
              dateStart: '2026-08-01T23:30:00-05:00',
            },
          ],
        }),
      ],
      directory(),
    );

    expect(result.assignments[0].startDate).toEqual(
      new Date('2026-08-01T00:00:00.000Z'),
    );
  });
});

function employee(id: number, email: string): TimetrackerEmployee {
  return {
    id,
    email,
    name: `Synthetic ${id}`,
    hash: `hash-${id}`,
    countryCode: 'ZZ',
    days: [],
  };
}

function directory(): TimetrackerEmployee[] {
  return [
    employee(10, 'member@example.test'),
    employee(20, 'pm@example.test'),
    employee(30, 'dm@example.test'),
  ];
}

function project(overrides: Partial<ProjectTalentDto> = {}): ProjectTalentDto {
  return {
    id: 100,
    name: 'Synthetic Project',
    description: 'Synthetic project used only in tests',
    startDate: '2026-08-01T00:00:00.000Z',
    endDate: null,
    status: ProjectStatus.Active,
    type: ProjectType.Billable,
    projectManager: ' PM@example.test ',
    deliveryManager: 'dm@EXAMPLE.test',
    members: [
      {
        email: 'member@example.test',
        dateStart: '2026-08-01T12:30:00.000Z',
        dateEnd: null,
      },
    ],
    isBillable: true,
    ...overrides,
  };
}
