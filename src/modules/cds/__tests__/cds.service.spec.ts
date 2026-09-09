import { Test, TestingModule } from '@nestjs/testing';
import { DepartmentDirectory } from '../../contracts/department-directory.contract';
import { PrismaService } from '../../../prisma/prisma.service';
import { CdsService } from '../cds.service';

type PrismaMock = {
  departmentHistory: { findFirst: jest.Mock };
  positionHistory: { findFirst: jest.Mock };
  skillsMatrixEntry: { findUnique: jest.Mock };
  cDSAssessment: { findMany: jest.Mock };
};

describe('CdsService', () => {
  let service: CdsService;
  const departmentDirectory = {
    getDepartmentByName: jest.fn(),
    getManagedDepartmentIds: jest.fn(),
  };
  const prisma: PrismaMock = {
    departmentHistory: { findFirst: jest.fn() },
    positionHistory: { findFirst: jest.fn() },
    skillsMatrixEntry: { findUnique: jest.fn() },
    cDSAssessment: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CdsService,
        { provide: PrismaService, useValue: prisma },
        { provide: DepartmentDirectory, useValue: departmentDirectory },
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
      assessments: [],
    });
  });

  it('returns matrixLink null when department history is missing', async () => {
    prisma.departmentHistory.findFirst.mockResolvedValue(null);
    prisma.positionHistory.findFirst.mockResolvedValue({
      value: 'Software Engineer',
    });
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
      assessments: [],
    });
  });

  it('orders assessments by date, createdAt, and id descending', async () => {
    prisma.departmentHistory.findFirst.mockResolvedValue(null);
    prisma.positionHistory.findFirst.mockResolvedValue(null);
    prisma.cDSAssessment.findMany.mockResolvedValue([]);

    await service.buildSection('subject-1');

    expect(prisma.cDSAssessment.findMany).toHaveBeenCalledWith({
      where: { employeeId: 'subject-1' },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    });
  });
});
