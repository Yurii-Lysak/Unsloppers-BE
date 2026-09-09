import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface SkillsMatrixSeedSummary {
  dictionaryEntriesUpserted: number;
  demoAssessmentsCreated: number;
}

type DepartmentPositionPair = {
  departmentName: string;
  position: string;
  employeeIds: string[];
};

/**
 * Seeds Story 8.1's skills-matrix dictionary from the bootcamp population's
 * current department+position pairs (never a hand-authored list) and adds a
 * couple of demonstrative completed assessments so CDS is manually verifiable
 * after `db:seed`.
 */
export async function seedSkillsMatrix(
  prisma: PrismaService,
  logger: Pick<Logger, 'log' | 'warn'> = new Logger('SkillsMatrixSeed'),
): Promise<SkillsMatrixSeedSummary> {
  const [departmentRows, positionRows] = await Promise.all([
    prisma.departmentHistory.findMany({
      where: { effectiveTo: null },
      select: { employeeId: true, value: true },
    }),
    prisma.positionHistory.findMany({
      where: { effectiveTo: null },
      select: { employeeId: true, value: true },
    }),
  ]);

  const positionByEmployee = new Map(
    positionRows.map((row) => [row.employeeId, row.value]),
  );

  const pairs = new Map<string, DepartmentPositionPair>();
  for (const row of departmentRows) {
    const position = positionByEmployee.get(row.employeeId);
    if (!position) {
      continue;
    }
    const key = `${row.value}\u0000${position}`;
    const existing = pairs.get(key);
    if (existing) {
      existing.employeeIds.push(row.employeeId);
      continue;
    }
    pairs.set(key, {
      departmentName: row.value,
      position,
      employeeIds: [row.employeeId],
    });
  }

  let dictionaryEntriesUpserted = 0;
  const employeesWithDictionary = new Set<string>();

  for (const pair of [...pairs.values()].sort((a, b) =>
    `${a.departmentName}\u0000${a.position}`.localeCompare(
      `${b.departmentName}\u0000${b.position}`,
    ),
  )) {
    const department = await prisma.department.findUnique({
      where: { name: pair.departmentName },
      select: { id: true },
    });
    if (!department) {
      logger.warn(
        `Skipping skills-matrix seed for "${pair.departmentName}" + "${pair.position}" — ` +
          'no matching Department row (run seedDepartments first).',
      );
      continue;
    }

    const fileUrl = buildMatrixFileUrl(pair.departmentName, pair.position);
    const existing = await prisma.skillsMatrixEntry.findUnique({
      where: {
        departmentId_position: {
          departmentId: department.id,
          position: pair.position,
        },
      },
    });

    if (existing) {
      await prisma.skillsMatrixEntry.update({
        where: { id: existing.id },
        data: { fileUrl },
      });
    } else {
      await prisma.skillsMatrixEntry.create({
        data: {
          departmentId: department.id,
          position: pair.position,
          fileUrl,
        },
      });
    }

    dictionaryEntriesUpserted += 1;
    pair.employeeIds.forEach((employeeId) =>
      employeesWithDictionary.add(employeeId),
    );
  }

  let demoAssessmentsCreated = 0;
  const demoEmployeeId = [...employeesWithDictionary].sort()[0];
  if (demoEmployeeId) {
    const existingCount = await prisma.cDSAssessment.count({
      where: { employeeId: demoEmployeeId },
    });
    if (existingCount === 0) {
      await prisma.cDSAssessment.createMany({
        data: [
          {
            employeeId: demoEmployeeId,
            date: new Date('2026-06-15'),
            assessor: 'Bootcamp Assessment Manager',
            resultLink:
              'https://skills-matrix.bootcamp.example/assessments/demo-2026-06',
            conclusion:
              'Demonstrates solid technical fundamentals with room to grow in system design.',
          },
          {
            employeeId: demoEmployeeId,
            date: new Date('2025-12-01'),
            assessor: 'Bootcamp Assessment Manager',
            resultLink:
              'https://skills-matrix.bootcamp.example/assessments/demo-2025-12',
            conclusion:
              'Completed annual skills review; development plan agreed with manager.',
          },
        ],
      });
      demoAssessmentsCreated = 2;
    }
  } else {
    logger.warn(
      'No skills-matrix dictionary entries were seeded — skipping demo CDS assessments.',
    );
  }

  logger.log(
    `Seeded ${dictionaryEntriesUpserted} skills-matrix dictionary entr${dictionaryEntriesUpserted === 1 ? 'y' : 'ies'} ` +
      `and ${demoAssessmentsCreated} demonstrative assessment(s).`,
  );

  return { dictionaryEntriesUpserted, demoAssessmentsCreated };
}

function buildMatrixFileUrl(departmentName: string, position: string): string {
  const departmentSlug = slugify(departmentName);
  const positionSlug = slugify(position);
  return `https://skills-matrix.bootcamp.example/files/${departmentSlug}/${positionSlug}`;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
