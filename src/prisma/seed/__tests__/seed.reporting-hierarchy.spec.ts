import { PrismaService } from '../../prisma.service';
import {
  BOOTCAMP_REPORTING_LINES,
  seedBootcampReportingHierarchy,
} from '../seed.reporting-hierarchy';

describe('seedBootcampReportingHierarchy', () => {
  it('sets managerId for each resolvable reporting line', async () => {
    const employees = new Map<
      string,
      { id: string; email: string; managerId: string | null }
    >([
      ['oksana.hordiienko@altexsoft.com', { id: 'ceo', email: 'oksana.hordiienko@altexsoft.com', managerId: null }],
      ['viktor.bondar@altexsoft.com', { id: 'director', email: 'viktor.bondar@altexsoft.com', managerId: null }],
      ['olena.romaniuk@altexsoft.com', { id: 'mgr-olena', email: 'olena.romaniuk@altexsoft.com', managerId: null }],
      ['andrii.kravets@altexsoft.com', { id: 'dev-1', email: 'andrii.kravets@altexsoft.com', managerId: null }],
    ]);

    const employeeUpdate = jest.fn(
      ({
        where,
        data,
      }: {
        where: { id: string };
        data: { managerId: string };
      }) => {
        for (const employee of employees.values()) {
          if (employee.id === where.id) {
            employee.managerId = data.managerId;
          }
        }
        return Promise.resolve({});
      },
    );

    const prisma = {
      employee: {
        findFirst: jest.fn(
          ({ where }: { where: { user: { email: string } } }) => {
            const employee = employees.get(where.user.email);
            return Promise.resolve(
              employee
                ? { id: employee.id, managerId: employee.managerId }
                : null,
            );
          },
        ),
        update: employeeUpdate,
      },
    } as unknown as PrismaService;

    const linksSet = await seedBootcampReportingHierarchy(prisma);

    expect(linksSet).toBe(3);
    expect(employees.get('viktor.bondar@altexsoft.com')?.managerId).toBe('ceo');
    expect(employees.get('olena.romaniuk@altexsoft.com')?.managerId).toBe(
      'director',
    );
    expect(employees.get('andrii.kravets@altexsoft.com')?.managerId).toBe(
      'mgr-olena',
    );
    expect(employeeUpdate).toHaveBeenCalledTimes(3);
  });

  it('is idempotent when managerId already matches', async () => {
    const employees = new Map([
      [
        'olena.romaniuk@altexsoft.com',
        { id: 'mgr-olena', email: 'olena.romaniuk@altexsoft.com', managerId: 'director' },
      ],
      [
        'viktor.bondar@altexsoft.com',
        { id: 'director', email: 'viktor.bondar@altexsoft.com', managerId: null },
      ],
      [
        'oksana.hordiienko@altexsoft.com',
        { id: 'ceo', email: 'oksana.hordiienko@altexsoft.com', managerId: null },
      ],
    ]);

    const prisma = {
      employee: {
        findFirst: jest.fn(
          ({ where }: { where: { user: { email: string } } }) => {
            const employee = employees.get(where.user.email);
            return Promise.resolve(
              employee
                ? { id: employee.id, managerId: employee.managerId }
                : null,
            );
          },
        ),
        update: jest.fn(),
      },
    } as unknown as PrismaService;

    const linksSet = await seedBootcampReportingHierarchy(prisma);

    expect(linksSet).toBe(1);
    expect(prisma.employee.update).toHaveBeenCalledTimes(1);
  });

  it('exports a reporting line for each bootcamp unit-manager demo account', () => {
    const olenaReports = BOOTCAMP_REPORTING_LINES.filter(
      ([, manager]) => manager === 'olena.romaniuk@altexsoft.com',
    );
    const andriiReports = BOOTCAMP_REPORTING_LINES.filter(
      ([, manager]) => manager === 'andrii.fedorchuk@altexsoft.com',
    );

    expect(olenaReports.length).toBeGreaterThanOrEqual(4);
    expect(andriiReports.length).toBeGreaterThanOrEqual(8);
  });
});
