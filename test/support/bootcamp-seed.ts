import { PrismaService } from '../../src/prisma/prisma.service';
import { SeedService } from '../../src/prisma/seed/seed.service';

export const BOOTCAMP_E2E_PASSWORD = 'bootcamp-e2e-test-password';

/** Bootcamp manifest accounts used for Story 1.8 colleague-whitelist e2e. */
export const BOOTCAMP_MANAGER_EMAIL = 'olena.romaniuk@altexsoft.com';
export const BOOTCAMP_REPORT_EMAIL = 'andrii.fedorchuk@altexsoft.com';
export const BOOTCAMP_COLLEAGUE_EMAIL = 'andrii.kravets@altexsoft.com';

export interface BootcampWhitelistGraph {
  managerEmail: string;
  reportEmployeeId: string;
  colleagueUserId: string;
  colleagueEmployeeId: string;
  password: string;
}

/** Runs the bundled bootcamp seed chain and wires a manager → report line. */
export async function seedBootcampWhitelistGraph(
  prisma: PrismaService,
): Promise<BootcampWhitelistGraph> {
  const seedService = new SeedService(prisma, BOOTCAMP_E2E_PASSWORD);
  await seedService.run();

  const managerUser = await prisma.user.findUniqueOrThrow({
    where: { email: BOOTCAMP_MANAGER_EMAIL },
    select: { id: true },
  });
  const reportUser = await prisma.user.findUniqueOrThrow({
    where: { email: BOOTCAMP_REPORT_EMAIL },
    select: { id: true },
  });
  const colleagueUser = await prisma.user.findUniqueOrThrow({
    where: { email: BOOTCAMP_COLLEAGUE_EMAIL },
    select: { id: true },
  });

  const managerEmployee = await prisma.employee.findUniqueOrThrow({
    where: { userId: managerUser.id },
    select: { id: true },
  });
  const reportEmployee = await prisma.employee.findUniqueOrThrow({
    where: { userId: reportUser.id },
    select: { id: true },
  });
  const colleagueEmployee = await prisma.employee.findUniqueOrThrow({
    where: { userId: colleagueUser.id },
    select: { id: true },
  });

  await prisma.employee.update({
    where: { id: reportEmployee.id },
    data: { managerId: managerEmployee.id },
  });

  return {
    managerEmail: BOOTCAMP_MANAGER_EMAIL,
    reportEmployeeId: reportEmployee.id,
    colleagueUserId: colleagueUser.id,
    colleagueEmployeeId: colleagueEmployee.id,
    password: BOOTCAMP_E2E_PASSWORD,
  };
}
