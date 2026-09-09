import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Clock } from '../../../clock/clock.service';
import { DepartmentDirectory } from '../../contracts/department-directory.contract';
import { PrismaService } from '../../../prisma/prisma.service';
import { CdsService } from '../cds.service';

type PrismaMock = {
  departmentHistory: { findFirst: jest.Mock };
  positionHistory: { findFirst: jest.Mock };
  skillsMatrixEntry: { findUnique: jest.Mock };
  cDSAssessment: {
    findMany: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
    findFirst: jest.Mock;
  };
  iDPRecord: {
    findMany: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
    findFirst: jest.Mock;
  };
};

describe('CdsService', () => {
  let service: CdsService;
  const departmentDirectory = {
    getDepartmentByName: jest.fn(),
    getManagedDepartmentIds: jest.fn(),
  };
  const clock = {
    now: jest.fn(() => new Date('2026-09-09T12:00:00.000Z')),
    nowMs: jest.fn(() => Date.parse('2026-09-09T12:00:00.000Z')),
  };
  const prisma: PrismaMock = {
    departmentHistory: { findFirst: jest.fn() },
    positionHistory: { findFirst: jest.fn() },
    skillsMatrixEntry: { findUnique: jest.fn() },
    cDSAssessment: {
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
    },
    iDPRecord: {
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CdsService,
        { provide: PrismaService, useValue: prisma },
        { provide: DepartmentDirectory, useValue: departmentDirectory },
        { provide: Clock, useValue: clock },
      ],
    }).compile();

    service = module.get(CdsService);
  });

  it('buildSection returns matrixLink and assessments newest-first', async () => {
    prisma.departmentHistory.findFirst.mockResolvedValue({
      value: 'Engineering',
    });
    prisma.positionHistory.findFirst.mockResolvedValue({
      value: 'Software Engineer',
    });
    departmentDirectory.getDepartmentByName.mockResolvedValue({
      id: 'dept-1',
      name: 'Engineering',
      parentId: null,
      managerId: 'manager-1',
    });
    prisma.skillsMatrixEntry.findUnique.mockResolvedValue({
      fileUrl: 'https://skills-matrix.example/engineering/software-engineer',
    });
    prisma.iDPRecord.findMany.mockResolvedValue([]);
    prisma.cDSAssessment.findMany.mockResolvedValue([
      {
        id: 'assessment-2',
        employeeId: 'subject-1',
        date: new Date('2026-06-15T00:00:00.000Z'),
        assessor: 'Assessment Manager',
        resultLink: 'https://skills-matrix.example/results/2',
        conclusion: 'Recent review',
        createdAt: new Date('2026-06-16T10:00:00.000Z'),
      },
      {
        id: 'assessment-1',
        employeeId: 'subject-1',
        date: new Date('2025-12-01T00:00:00.000Z'),
        assessor: 'Assessment Manager',
        resultLink: 'https://skills-matrix.example/results/1',
        conclusion: 'Earlier review',
        createdAt: new Date('2025-12-02T10:00:00.000Z'),
      },
    ]);

    await expect(service.buildSection('subject-1')).resolves.toEqual({
      matrixLink: 'https://skills-matrix.example/engineering/software-engineer',
      idpRecords: [],
      assessments: [
        {
          id: 'assessment-2',
          date: '2026-06-15',
          assessor: 'Assessment Manager',
          resultLink: 'https://skills-matrix.example/results/2',
          conclusion: 'Recent review',
          createdAt: '2026-06-16T10:00:00.000Z',
        },
        {
          id: 'assessment-1',
          date: '2025-12-01',
          assessor: 'Assessment Manager',
          resultLink: 'https://skills-matrix.example/results/1',
          conclusion: 'Earlier review',
          createdAt: '2025-12-02T10:00:00.000Z',
        },
      ],
    });
  });

  it('returns matrixLink null when no dictionary entry exists', async () => {
    prisma.departmentHistory.findFirst.mockResolvedValue({
      value: 'Engineering',
    });
    prisma.positionHistory.findFirst.mockResolvedValue({
      value: 'Software Engineer',
    });
    departmentDirectory.getDepartmentByName.mockResolvedValue({
      id: 'dept-1',
      name: 'Engineering',
      parentId: null,
      managerId: null,
    });
    prisma.skillsMatrixEntry.findUnique.mockResolvedValue(null);
    prisma.cDSAssessment.findMany.mockResolvedValue([]);

    await expect(service.buildSection('subject-1')).resolves.toEqual({
      matrixLink: null,
      idpRecords: [],
      assessments: [],
    });
  });

  it('returns matrixLink null when department history is missing', async () => {
    prisma.departmentHistory.findFirst.mockResolvedValue(null);
    prisma.positionHistory.findFirst.mockResolvedValue({
      value: 'Software Engineer',
    });
    prisma.iDPRecord.findMany.mockResolvedValue([]);
    prisma.cDSAssessment.findMany.mockResolvedValue([
      {
        id: 'assessment-1',
        employeeId: 'subject-1',
        date: new Date('2026-01-01T00:00:00.000Z'),
        assessor: 'Assessment Manager',
        resultLink: 'https://skills-matrix.example/results/1',
        conclusion: 'Review',
        createdAt: new Date('2026-01-02T10:00:00.000Z'),
      },
    ]);

    await expect(service.buildSection('subject-1')).resolves.toEqual({
      matrixLink: null,
      idpRecords: [],
      assessments: [
        expect.objectContaining({
          id: 'assessment-1',
          date: '2026-01-01',
        }),
      ],
    });

    expect(departmentDirectory.getDepartmentByName).not.toHaveBeenCalled();
    expect(prisma.skillsMatrixEntry.findUnique).not.toHaveBeenCalled();
  });

  it('returns matrixLink null when position history is missing', async () => {
    prisma.departmentHistory.findFirst.mockResolvedValue({
      value: 'Engineering',
    });
    prisma.positionHistory.findFirst.mockResolvedValue(null);
    prisma.iDPRecord.findMany.mockResolvedValue([]);
    prisma.cDSAssessment.findMany.mockResolvedValue([
      {
        id: 'assessment-1',
        employeeId: 'subject-1',
        date: new Date('2026-01-01T00:00:00.000Z'),
        assessor: 'Assessment Manager',
        resultLink: 'https://skills-matrix.example/results/1',
        conclusion: 'Review',
        createdAt: new Date('2026-01-02T10:00:00.000Z'),
      },
    ]);

    await expect(service.buildSection('subject-1')).resolves.toEqual({
      matrixLink: null,
      idpRecords: [],
      assessments: [
        expect.objectContaining({
          id: 'assessment-1',
          date: '2026-01-01',
        }),
      ],
    });

    expect(departmentDirectory.getDepartmentByName).not.toHaveBeenCalled();
    expect(prisma.skillsMatrixEntry.findUnique).not.toHaveBeenCalled();
  });

  it('returns matrixLink null when department directory misses the history value', async () => {
    prisma.departmentHistory.findFirst.mockResolvedValue({
      value: 'Unknown Department',
    });
    prisma.positionHistory.findFirst.mockResolvedValue({
      value: 'Software Engineer',
    });
    departmentDirectory.getDepartmentByName.mockResolvedValue(null);
    prisma.iDPRecord.findMany.mockResolvedValue([]);
    prisma.cDSAssessment.findMany.mockResolvedValue([
      {
        id: 'assessment-1',
        employeeId: 'subject-1',
        date: new Date('2026-01-01T00:00:00.000Z'),
        assessor: 'Assessment Manager',
        resultLink: 'https://skills-matrix.example/results/1',
        conclusion: 'Review',
        createdAt: new Date('2026-01-02T10:00:00.000Z'),
      },
    ]);

    await expect(service.buildSection('subject-1')).resolves.toEqual({
      matrixLink: null,
      idpRecords: [],
      assessments: [
        expect.objectContaining({
          id: 'assessment-1',
          date: '2026-01-01',
        }),
      ],
    });

    expect(prisma.skillsMatrixEntry.findUnique).not.toHaveBeenCalled();
  });

  it('returns assessments when dictionary entry is missing', async () => {
    prisma.departmentHistory.findFirst.mockResolvedValue({
      value: 'Engineering',
    });
    prisma.positionHistory.findFirst.mockResolvedValue({
      value: 'Software Engineer',
    });
    departmentDirectory.getDepartmentByName.mockResolvedValue({
      id: 'dept-1',
      name: 'Engineering',
      parentId: null,
      managerId: null,
    });
    prisma.skillsMatrixEntry.findUnique.mockResolvedValue(null);
    prisma.iDPRecord.findMany.mockResolvedValue([]);
    prisma.cDSAssessment.findMany.mockResolvedValue([
      {
        id: 'assessment-1',
        employeeId: 'subject-1',
        date: new Date('2026-01-01T00:00:00.000Z'),
        assessor: 'Assessment Manager',
        resultLink: 'https://skills-matrix.example/results/1',
        conclusion: 'Review',
        createdAt: new Date('2026-01-02T10:00:00.000Z'),
      },
    ]);

    await expect(service.buildSection('subject-1')).resolves.toEqual({
      matrixLink: null,
      idpRecords: [],
      assessments: [
        expect.objectContaining({
          id: 'assessment-1',
          date: '2026-01-01',
        }),
      ],
    });
  });

  it('returns empty assessments when matrix link resolves', async () => {
    prisma.departmentHistory.findFirst.mockResolvedValue({
      value: 'Engineering',
    });
    prisma.positionHistory.findFirst.mockResolvedValue({
      value: 'Software Engineer',
    });
    departmentDirectory.getDepartmentByName.mockResolvedValue({
      id: 'dept-1',
      name: 'Engineering',
      parentId: null,
      managerId: null,
    });
    prisma.skillsMatrixEntry.findUnique.mockResolvedValue({
      fileUrl: 'https://skills-matrix.example/engineering/software-engineer',
    });
    prisma.cDSAssessment.findMany.mockResolvedValue([]);

    await expect(service.buildSection('subject-1')).resolves.toEqual({
      matrixLink: 'https://skills-matrix.example/engineering/software-engineer',
      idpRecords: [],
      assessments: [],
    });
  });

  it('orders assessments by date, createdAt, and id descending', async () => {
    prisma.departmentHistory.findFirst.mockResolvedValue(null);
    prisma.positionHistory.findFirst.mockResolvedValue(null);
    prisma.cDSAssessment.findMany.mockResolvedValue([]);
    prisma.iDPRecord.findMany.mockResolvedValue([]);

    await service.buildSection('subject-1');

    expect(prisma.cDSAssessment.findMany).toHaveBeenCalledWith({
      where: { employeeId: 'subject-1' },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    });
  });

  it('buildSection orders idpRecords by createdAt desc then id desc', async () => {
    prisma.departmentHistory.findFirst.mockResolvedValue(null);
    prisma.positionHistory.findFirst.mockResolvedValue(null);
    prisma.cDSAssessment.findMany.mockResolvedValue([]);
    prisma.iDPRecord.findMany.mockResolvedValue([]);

    await service.buildSection('subject-1');

    expect(prisma.iDPRecord.findMany).toHaveBeenCalledWith({
      where: { employeeId: 'subject-1' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  });

  it('buildSection returns idpRecords newest-first', async () => {
    prisma.departmentHistory.findFirst.mockResolvedValue(null);
    prisma.positionHistory.findFirst.mockResolvedValue(null);
    prisma.cDSAssessment.findMany.mockResolvedValue([]);
    prisma.iDPRecord.findMany.mockResolvedValue([
      {
        id: 'idp-2',
        employeeId: 'subject-1',
        description: 'Recent plan',
        deadline: new Date('2026-12-01T00:00:00.000Z'),
        fileUrl: 'https://example.com/idp-2',
        completedAt: null,
        createdAt: new Date('2026-09-02T10:00:00.000Z'),
        updatedAt: new Date('2026-09-02T10:00:00.000Z'),
      },
      {
        id: 'idp-1',
        employeeId: 'subject-1',
        description: 'Earlier plan',
        deadline: new Date('2026-06-01T00:00:00.000Z'),
        fileUrl: 'https://example.com/idp-1',
        completedAt: new Date('2026-08-01T12:00:00.000Z'),
        createdAt: new Date('2026-05-02T10:00:00.000Z'),
        updatedAt: new Date('2026-08-01T12:00:00.000Z'),
      },
    ]);

    await expect(service.buildSection('subject-1')).resolves.toEqual({
      matrixLink: null,
      assessments: [],
      idpRecords: [
        {
          id: 'idp-2',
          description: 'Recent plan',
          deadline: '2026-12-01',
          fileUrl: 'https://example.com/idp-2',
          completedAt: null,
        },
        {
          id: 'idp-1',
          description: 'Earlier plan',
          deadline: '2026-06-01',
          fileUrl: 'https://example.com/idp-1',
          completedAt: '2026-08-01T12:00:00.000Z',
        },
      ],
    });
  });

  it('createAssessment appends a new assessment entry', async () => {
    prisma.cDSAssessment.create.mockResolvedValue({
      id: 'assessment-new',
      employeeId: 'subject-1',
      date: new Date('2026-07-01T00:00:00.000Z'),
      assessor: 'Assessment Manager',
      resultLink: 'https://skills-matrix.example/results/new',
      conclusion: 'New assessment conclusion',
      createdAt: new Date('2026-07-02T10:00:00.000Z'),
    });

    await expect(
      service.createAssessment('subject-1', {
        date: '2026-07-01',
        assessor: 'Assessment Manager',
        resultLink: 'https://skills-matrix.example/results/new',
        conclusion: 'New assessment conclusion',
      }),
    ).resolves.toEqual({
      id: 'assessment-new',
      date: '2026-07-01',
      assessor: 'Assessment Manager',
      resultLink: 'https://skills-matrix.example/results/new',
      conclusion: 'New assessment conclusion',
      createdAt: '2026-07-02T10:00:00.000Z',
    });
  });

  it('updateAssessmentConclusion updates only the conclusion field', async () => {
    prisma.cDSAssessment.updateMany.mockResolvedValue({ count: 1 });
    prisma.cDSAssessment.findFirst.mockResolvedValue({
      id: 'assessment-1',
      employeeId: 'subject-1',
      date: new Date('2026-06-15T00:00:00.000Z'),
      assessor: 'Assessment Manager',
      resultLink: 'https://skills-matrix.example/results/1',
      conclusion: 'Updated conclusion',
      createdAt: new Date('2026-06-16T10:00:00.000Z'),
    });

    await expect(
      service.updateAssessmentConclusion('subject-1', 'assessment-1', {
        conclusion: 'Updated conclusion',
      }),
    ).resolves.toEqual({
      id: 'assessment-1',
      date: '2026-06-15',
      assessor: 'Assessment Manager',
      resultLink: 'https://skills-matrix.example/results/1',
      conclusion: 'Updated conclusion',
      createdAt: '2026-06-16T10:00:00.000Z',
    });

    expect(prisma.cDSAssessment.updateMany).toHaveBeenCalledWith({
      where: { id: 'assessment-1', employeeId: 'subject-1' },
      data: { conclusion: 'Updated conclusion' },
    });
  });

  it('updateAssessmentConclusion throws 404 when assessment is missing', async () => {
    prisma.cDSAssessment.updateMany.mockResolvedValue({ count: 0 });
    prisma.cDSAssessment.findFirst.mockResolvedValue(null);

    await expect(
      service.updateAssessmentConclusion('subject-1', 'missing-assessment', {
        conclusion: 'Updated conclusion',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('createIdpRecord persists required fields with completedAt null', async () => {
    prisma.iDPRecord.create.mockResolvedValue({
      id: 'idp-1',
      employeeId: 'subject-1',
      description: 'Leadership course',
      deadline: new Date('2026-12-01T00:00:00.000Z'),
      fileUrl: 'https://example.com/idp',
      completedAt: null,
      createdAt: new Date('2026-09-09T10:00:00.000Z'),
      updatedAt: new Date('2026-09-09T10:00:00.000Z'),
    });

    await expect(
      service.createIdpRecord('subject-1', {
        description: 'Leadership course',
        deadline: '2026-12-01',
        fileUrl: 'https://example.com/idp',
      }),
    ).resolves.toEqual({
      id: 'idp-1',
      description: 'Leadership course',
      deadline: '2026-12-01',
      fileUrl: 'https://example.com/idp',
      completedAt: null,
    });
  });

  it('updateIdpRecord returns existing open record for empty patch', async () => {
    prisma.iDPRecord.findFirst.mockResolvedValue({
      id: 'idp-1',
      employeeId: 'subject-1',
      description: 'Leadership course',
      deadline: new Date('2026-12-01T00:00:00.000Z'),
      fileUrl: 'https://example.com/idp',
      completedAt: null,
      createdAt: new Date('2026-09-09T10:00:00.000Z'),
      updatedAt: new Date('2026-09-09T10:00:00.000Z'),
    });

    await expect(
      service.updateIdpRecord('subject-1', 'idp-1', {}),
    ).resolves.toEqual({
      id: 'idp-1',
      description: 'Leadership course',
      deadline: '2026-12-01',
      fileUrl: 'https://example.com/idp',
      completedAt: null,
    });

    expect(prisma.iDPRecord.updateMany).not.toHaveBeenCalled();
  });

  it('updateIdpRecord persists field changes on open records', async () => {
    prisma.iDPRecord.updateMany.mockResolvedValue({ count: 1 });
    prisma.iDPRecord.findFirst.mockResolvedValue({
      id: 'idp-1',
      employeeId: 'subject-1',
      description: 'Updated plan',
      deadline: new Date('2027-01-15T00:00:00.000Z'),
      fileUrl: 'https://example.com/idp-updated',
      completedAt: null,
      createdAt: new Date('2026-09-09T10:00:00.000Z'),
      updatedAt: new Date('2026-09-09T11:00:00.000Z'),
    });

    await expect(
      service.updateIdpRecord('subject-1', 'idp-1', {
        description: 'Updated plan',
        deadline: '2027-01-15',
        fileUrl: 'https://example.com/idp-updated',
      }),
    ).resolves.toEqual({
      id: 'idp-1',
      description: 'Updated plan',
      deadline: '2027-01-15',
      fileUrl: 'https://example.com/idp-updated',
      completedAt: null,
    });

    expect(prisma.iDPRecord.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'idp-1',
        employeeId: 'subject-1',
        completedAt: null,
      },
      data: {
        description: 'Updated plan',
        deadline: new Date('2027-01-15T00:00:00.000Z'),
        fileUrl: 'https://example.com/idp-updated',
      },
    });
  });

  it('updateIdpRecord throws 409 when record is completed', async () => {
    prisma.iDPRecord.updateMany.mockResolvedValue({ count: 0 });
    prisma.iDPRecord.findFirst.mockResolvedValue({
      id: 'idp-1',
      employeeId: 'subject-1',
      description: 'Leadership course',
      deadline: new Date('2026-12-01T00:00:00.000Z'),
      fileUrl: 'https://example.com/idp',
      completedAt: new Date('2026-09-01T12:00:00.000Z'),
      createdAt: new Date('2026-09-09T10:00:00.000Z'),
      updatedAt: new Date('2026-09-09T10:00:00.000Z'),
    });

    await expect(
      service.updateIdpRecord('subject-1', 'idp-1', {
        description: 'Updated plan',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('completeIdpRecord sets completedAt from clock', async () => {
    prisma.iDPRecord.updateMany.mockResolvedValue({ count: 1 });
    prisma.iDPRecord.findFirst.mockResolvedValue({
      id: 'idp-1',
      employeeId: 'subject-1',
      description: 'Leadership course',
      deadline: new Date('2026-12-01T00:00:00.000Z'),
      fileUrl: 'https://example.com/idp',
      completedAt: new Date('2026-09-09T12:00:00.000Z'),
      createdAt: new Date('2026-09-09T10:00:00.000Z'),
      updatedAt: new Date('2026-09-09T12:00:00.000Z'),
    });

    await expect(
      service.completeIdpRecord('subject-1', 'idp-1'),
    ).resolves.toEqual({
      id: 'idp-1',
      description: 'Leadership course',
      deadline: '2026-12-01',
      fileUrl: 'https://example.com/idp',
      completedAt: '2026-09-09T12:00:00.000Z',
    });

    expect(prisma.iDPRecord.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'idp-1',
        employeeId: 'subject-1',
        completedAt: null,
      },
      data: {
        completedAt: new Date('2026-09-09T12:00:00.000Z'),
      },
    });
  });

  it('completeIdpRecord throws 404 when record is missing', async () => {
    prisma.iDPRecord.updateMany.mockResolvedValue({ count: 0 });
    prisma.iDPRecord.findFirst.mockResolvedValue(null);

    await expect(
      service.completeIdpRecord('subject-1', 'missing-idp'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('completeIdpRecord throws 409 when record is already completed', async () => {
    prisma.iDPRecord.updateMany.mockResolvedValue({ count: 0 });
    prisma.iDPRecord.findFirst.mockResolvedValue({
      id: 'idp-1',
      employeeId: 'subject-1',
      description: 'Leadership course',
      deadline: new Date('2026-12-01T00:00:00.000Z'),
      fileUrl: 'https://example.com/idp',
      completedAt: new Date('2026-09-01T12:00:00.000Z'),
      createdAt: new Date('2026-09-09T10:00:00.000Z'),
      updatedAt: new Date('2026-09-09T12:00:00.000Z'),
    });

    await expect(
      service.completeIdpRecord('subject-1', 'idp-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
