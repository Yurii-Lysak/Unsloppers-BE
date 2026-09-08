import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { FunctionalRoleAssignmentService } from '../../modules/access/functional-role-assignment.service';
import { BUILT_IN_ROLE_NAMES } from '../../modules/contracts/permission-keys';
import { DepartmentSeedHaltError } from './seed.errors';

export interface DepartmentSeedSummary {
  departmentsUpserted: number;
  unitManagerAssignments: number;
}

/**
 * Seeds C12 `Department` rows from the bootcamp population's *current*
 * `DepartmentHistory.value` strings (Story 1.16's synthetic layer —
 * `Engineering`, `Quality Assurance`, `Design`, `Product`, `Operations` as
 * of this writing; never a hand-authored department list).
 *
 * The bootcamp manifest carries no independent "who is the Unit Manager"
 * signal (see `bootcamp-scope-overrides.md` — the manifest is identity-only,
 * position/department come entirely from `seed.synthetic.ts`'s deterministic
 * per-email hash). Absent that signal, this seed *designates* one bootcamp
 * employee per department as its Unit Manager, deterministically: the
 * employee with the earliest `effectiveFrom` (longest synthetic tenure) in
 * that department, tie-broken by employee id. That employee is both set as
 * the `Department.managerId` and granted the built-in Unit Manager
 * functional role (idempotent), so `fulfil_resourcing_requests` actually
 * resolves for them out of the box — without this, every department would
 * be reported as "resolvable" on `managerId` alone but no one could act on
 * it, defeating the manual test path.
 *
 * Every distinct current department value comes from at least one employee
 * by construction, so in practice this never hits the Block-If halt below —
 * documented explicitly because the spec calls out the halt as a real
 * possibility, not because bootcamp data is expected to trigger it.
 */
export async function seedDepartments(
  prisma: PrismaService,
  assignmentService: FunctionalRoleAssignmentService,
  logger: Pick<Logger, 'log' | 'warn'> = new Logger('DepartmentSeed'),
): Promise<DepartmentSeedSummary> {
  const rows = await prisma.departmentHistory.findMany({
    where: { effectiveTo: null },
    select: { value: true, employeeId: true, effectiveFrom: true },
  });

  const byDepartment = new Map<
    string,
    { employeeId: string; effectiveFrom: Date }[]
  >();
  for (const row of rows) {
    const list = byDepartment.get(row.value) ?? [];
    list.push({ employeeId: row.employeeId, effectiveFrom: row.effectiveFrom });
    byDepartment.set(row.value, list);
  }

  const departmentNames = [...byDepartment.keys()].sort();
  if (departmentNames.length === 0) {
    throw new DepartmentSeedHaltError(
      'Bootcamp population has no current department history rows — halting ' +
        'rather than inventing Department rows for C12 routing.',
    );
  }

  const unitManagerRole = await prisma.functionalRole.findFirst({
    where: {
      name: { equals: BUILT_IN_ROLE_NAMES.UNIT_MANAGER, mode: 'insensitive' },
    },
  });
  if (!unitManagerRole) {
    throw new DepartmentSeedHaltError(
      'Built-in Unit Manager functional role not found — run seedFunctionalRoles ' +
        'before seedDepartments.',
    );
  }

  let departmentsUpserted = 0;
  let unitManagerAssignments = 0;
  let resolvedManagerCount = 0;

  for (const name of departmentNames) {
    const members = byDepartment.get(name)!;
    const manager = [...members].sort((a, b) => {
      const diff = a.effectiveFrom.getTime() - b.effectiveFrom.getTime();
      return diff !== 0 ? diff : a.employeeId.localeCompare(b.employeeId);
    })[0];
    const managerId = manager?.employeeId ?? null;

    const existing = await prisma.department.findUnique({ where: { name } });
    if (existing) {
      await prisma.department.update({
        where: { id: existing.id },
        data: { managerId },
      });
    } else {
      await prisma.department.create({ data: { name, managerId } });
    }
    departmentsUpserted += 1;

    if (managerId) {
      resolvedManagerCount += 1;
      await assignmentService.assign(managerId, unitManagerRole.id);
      unitManagerAssignments += 1;
    }
  }

  if (resolvedManagerCount === 0) {
    throw new DepartmentSeedHaltError(
      'No Department row resolved a Unit Manager managerId from the bootcamp ' +
        'population — halting rather than leaving UM routing unresolvable.',
    );
  }

  logger.log(
    `Seeded ${departmentsUpserted} department(s) from bootcamp population; ` +
      `assigned the Unit Manager role to ${unitManagerAssignments} employee(s).`,
  );

  return { departmentsUpserted, unitManagerAssignments };
}
