import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

/**
 * Bootcamp reporting lines for local dev — enables C1 ReportingLine access
 * (e.g. Story 3.3 inline edit on direct reports).
 *
 * Pairs are `[reportEmail, managerEmail]`, aligned with
 * `docs/bootcamp-seed-accounts-source.csv` org roles.
 */
export const BOOTCAMP_REPORTING_LINES: ReadonlyArray<readonly [string, string]> =
  [
  // Executive spine
  ['viktor.bondar@altexsoft.com', 'oksana.hordiienko@altexsoft.com'],
  ['olena.romaniuk@altexsoft.com', 'viktor.bondar@altexsoft.com'],
  ['andrii.fedorchuk@altexsoft.com', 'viktor.bondar@altexsoft.com'],
  // Unit Manager Olena — .NET cluster
  ['andrii.kravets@altexsoft.com', 'olena.romaniuk@altexsoft.com'],
  ['andrii.lysenko@altexsoft.com', 'olena.romaniuk@altexsoft.com'],
  ['chidi.igwe@altexsoft.com', 'olena.romaniuk@altexsoft.com'],
  ['adam.keem@altexsoft.com', 'olena.romaniuk@altexsoft.com'],
  // Unit Manager Andrii — JS / Python cluster
  ['oleh.boiko@altexsoft.com', 'andrii.fedorchuk@altexsoft.com'],
  ['oleksandr.dorosh@altexsoft.com', 'andrii.fedorchuk@altexsoft.com'],
  ['oleksii.semenov@altexsoft.com', 'andrii.fedorchuk@altexsoft.com'],
  ['tesr.user@altex.com', 'andrii.fedorchuk@altexsoft.com'],
  ['vagif.mammadaliyev@altexsoft.com', 'andrii.fedorchuk@altexsoft.com'],
  ['vasyl.kravchenko@altexsoft.com', 'andrii.fedorchuk@altexsoft.com'],
  ['vladyslav.umanets@altexsoft.com', 'andrii.fedorchuk@altexsoft.com'],
  ['danylo.hordiienko@altexsoft.com', 'andrii.fedorchuk@altexsoft.com'],
  // Other functions reporting to CEO / director
  ['artem.shamraiev@altexsoft.com', 'oksana.hordiienko@altexsoft.com'],
  ['nataliia.musiienko@altexsoft.com', 'oksana.hordiienko@altexsoft.com'],
  ['alex.geraschenko@altexsoft.com', 'nataliia.musiienko@altexsoft.com'],
  ['olena.lysak@altexsoft.com', 'viktor.bondar@altexsoft.com'],
  ['diana.savchuk@altexsoft.com', 'viktor.bondar@altexsoft.com'],
  ['dmytro.danylenko@altexsoft.com', 'oksana.hordiienko@altexsoft.com'],
  ['artem.bondarenko@altexsoft.com', 'oksana.hordiienko@altexsoft.com'],
  ['tt.site-admin@altexsoft.com', 'oksana.hordiienko@altexsoft.com'],
];

/**
 * Idempotent: sets `managerId` on each bootcamp employee listed above.
 * Re-running seed converges links without duplicating history rows.
 */
export async function seedBootcampReportingHierarchy(
  prisma: PrismaService,
  logger: Pick<Logger, 'log' | 'warn'> = new Logger('ReportingHierarchySeed'),
): Promise<number> {
  let linksSet = 0;

  for (const [reportEmail, managerEmail] of BOOTCAMP_REPORTING_LINES) {
    const report = await prisma.employee.findFirst({
      where: { user: { email: reportEmail } },
      select: { id: true, managerId: true },
    });
    const manager = await prisma.employee.findFirst({
      where: { user: { email: managerEmail } },
      select: { id: true },
    });

    if (!report || !manager) {
      logger.warn(
        `Skipping reporting line ${reportEmail} → ${managerEmail}: employee not found`,
      );
      continue;
    }

    if (report.managerId === manager.id) {
      continue;
    }

    await prisma.employee.update({
      where: { id: report.id },
      data: { managerId: manager.id },
    });
    linksSet += 1;
  }

  if (linksSet > 0) {
    logger.log(`Seeded ${linksSet} bootcamp reporting line(s).`);
  }

  return linksSet;
}
