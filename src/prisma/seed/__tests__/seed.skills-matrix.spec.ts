import { seedSkillsMatrix } from '../seed.skills-matrix';
import { PrismaService } from '../../prisma.service';

describe('seedSkillsMatrix', () => {
  const silentLogger = { log: jest.fn(), warn: jest.fn() };

  it('upserts dictionary entries from current department+position pairs', async () => {
    const skillsMatrixCreate = jest.fn(
      ({
        data,
      }: {
        data: {
          departmentId: string;
          position: string;
          fileUrl: string;
        };
      }) =>
        Promise.resolve({
          id: 'matrix-1',
          departmentId: data.departmentId,
          position: data.position,
          fileUrl: data.fileUrl,
        }),
    );

    const prisma = {
      departmentHistory: {
        findMany: jest.fn().mockResolvedValue([
          { employeeId: 'employee-1', value: 'Engineering' },
          { employeeId: 'employee-2', value: 'Engineering' },
        ]),
      },
      positionHistory: {
        findMany: jest.fn().mockResolvedValue([
          { employeeId: 'employee-1', value: 'Software Engineer' },
          { employeeId: 'employee-2', value: 'Software Engineer' },
        ]),
      },
      department: {
        findUnique: jest.fn().mockResolvedValue({ id: 'dept-1' }),
      },
      skillsMatrixEntry: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        create: skillsMatrixCreate,
      },
      cDSAssessment: {
        count: jest.fn().mockResolvedValue(0),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    } as unknown as PrismaService;

    const summary = await seedSkillsMatrix(prisma, silentLogger);

    expect(summary.dictionaryEntriesUpserted).toBe(1);
    expect(summary.demoAssessmentsCreated).toBe(2);
    expect(skillsMatrixCreate).toHaveBeenCalledWith({
      data: {
        departmentId: 'dept-1',
        position: 'Software Engineer',
        fileUrl:
          'https://skills-matrix.bootcamp.example/files/engineering/software-engineer',
      },
    });
  });
});
