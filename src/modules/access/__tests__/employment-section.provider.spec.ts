import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmploymentSectionProvider } from '../employment-section.provider';

describe('EmploymentSectionProvider', () => {
  let provider: EmploymentSectionProvider;
  const prisma = { employee: { findUnique: jest.fn() } };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmploymentSectionProvider,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    provider = module.get(EmploymentSectionProvider);
  });

  it('resolves current grade, position, and employment type from history rows', async () => {
    prisma.employee.findUnique.mockResolvedValue({
      seniority: 'Senior',
      englishLevel: 'B2',
      probationStatus: 'Completed',
      contractType: 'Employment contract',
      gradeHistory: [
        {
          value: 'L3',
          effectiveFrom: new Date('2023-01-01'),
          effectiveTo: new Date('2024-01-01'),
        },
        {
          value: 'L4',
          effectiveFrom: new Date('2024-01-01'),
          effectiveTo: null,
        },
      ],
      positionHistory: [
        {
          value: 'Software Engineer',
          effectiveFrom: new Date('2024-01-01'),
          effectiveTo: null,
        },
      ],
      employmentTypeHistory: [
        {
          value: 'Full-time',
          effectiveFrom: new Date('2024-01-01'),
          effectiveTo: null,
        },
      ],
    });

    const section = await provider.getSection('viewer-1', 'subject-1');

    expect(section).toEqual({
      grade: 'L4',
      position: 'Software Engineer',
      seniority: 'Senior',
      employmentType: 'Full-time',
      englishLevel: 'B2',
      probationStatus: 'Completed',
      contractType: 'Employment contract',
    });
    expect(Object.keys(section)).toHaveLength(7);
    expect(Object.keys(section).sort()).toEqual(
      [
        'contractType',
        'employmentType',
        'englishLevel',
        'grade',
        'position',
        'probationStatus',
        'seniority',
      ].sort(),
    );
  });

  it('resolves current value from latest effectiveFrom when no open row exists', async () => {
    prisma.employee.findUnique.mockResolvedValue({
      seniority: null,
      englishLevel: null,
      probationStatus: null,
      contractType: null,
      gradeHistory: [
        {
          value: 'L2',
          effectiveFrom: new Date('2023-01-01'),
          effectiveTo: new Date('2023-12-31'),
        },
        {
          value: 'L3',
          effectiveFrom: new Date('2024-06-01'),
          effectiveTo: new Date('2024-12-31'),
        },
      ],
      positionHistory: [],
      employmentTypeHistory: [],
    });

    const section = await provider.getSection('viewer-1', 'subject-1');

    expect(section.grade).toBe('L3');
  });

  it('returns null temporal values when history arrays are empty', async () => {
    prisma.employee.findUnique.mockResolvedValue({
      seniority: null,
      englishLevel: null,
      probationStatus: null,
      contractType: null,
      gradeHistory: [],
      positionHistory: [],
      employmentTypeHistory: [],
    });

    const section = await provider.getSection('viewer-1', 'subject-1');

    expect(section).toEqual({
      grade: null,
      position: null,
      seniority: null,
      employmentType: null,
      englishLevel: null,
      probationStatus: null,
      contractType: null,
    });
  });

  it('passes through null plain columns while temporal values are set', async () => {
    prisma.employee.findUnique.mockResolvedValue({
      seniority: null,
      englishLevel: null,
      probationStatus: null,
      contractType: null,
      gradeHistory: [
        {
          value: 'L2',
          effectiveFrom: new Date('2024-01-01'),
          effectiveTo: null,
        },
      ],
      positionHistory: [],
      employmentTypeHistory: [],
    });

    const section = await provider.getSection('viewer-1', 'subject-1');

    expect(section.grade).toBe('L2');
    expect(section.position).toBeNull();
    expect(section.seniority).toBeNull();
    expect(section.employmentType).toBeNull();
    expect(section.englishLevel).toBeNull();
    expect(section.probationStatus).toBeNull();
    expect(section.contractType).toBeNull();
  });

  it('throws when the subject employee does not exist', async () => {
    prisma.employee.findUnique.mockResolvedValue(null);

    await expect(provider.getSection('viewer-1', 'missing')).rejects.toThrow(
      'Employee missing not found',
    );
  });
});
