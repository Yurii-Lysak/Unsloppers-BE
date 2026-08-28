import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { TimetrackerService } from '../../modules/timetracker/timetracker.service';
import { TimetrackerEmployee } from '../../modules/timetracker/timetracker.types';
import {
  assertPopulationSize,
  dedupeEmployeesByEmail,
  mostRecentCompleteMonth,
  normalizeEmailKey,
  validateAccountingEmployees,
  validateAccountingReport,
  validateTalentsProjects,
  validateTalentsResponse,
} from './seed.helpers';
import { buildSyntheticProfile } from './seed.synthetic';

export interface SeedSummary {
  identitiesUpserted: number;
  duplicateEmailsSkipped: number;
  orphanedTalentsMemberships: number;
}

/**
 * The single seed implementation reused by both triggers (`npm run db:seed`
 * locally, `postbuild` in auto-deploy) — see `prisma/seed.ts`, the thin CLI
 * entrypoint that constructs this class from a `NestFactory.createApplicationContext`
 * DI container and calls `run()`.
 *
 * Kept out of `prisma/seed.ts` itself (rather than inlined) purely so it can
 * be unit-tested under Jest, whose `rootDir` is `src` and would never
 * discover a `prisma/*.spec.ts` file (spec Tasks: "prisma/seed.spec.ts (or
 * module-local test)" — this is the module-local placement).
 */
export class SeedService {
  private readonly logger = new Logger('SeedService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly timetracker: TimetrackerService,
  ) {}

  async run(now: Date = new Date()): Promise<SeedSummary> {
    const { month, year } = mostRecentCompleteMonth(now);

    this.logger.log(
      `Fetching TimeTracker Accounting report for ${year}-${String(month).padStart(2, '0')}...`,
    );
    const accounting = await this.timetracker.fetchAccountingReport({
      month,
      year,
    });

    this.logger.log('Fetching TimeTracker Talents projects...');
    const talents = await this.timetracker.fetchTalentsProjects();

    // ---- Validation phase — nothing is written until this fully passes ----
    validateAccountingReport(accounting);
    validateTalentsResponse(talents);
    validateAccountingEmployees(accounting.employees);
    validateTalentsProjects(talents.projects);

    const { identities, duplicateEmails } = dedupeEmployeesByEmail(
      accounting.employees,
    );
    for (const email of duplicateEmails) {
      this.logger.warn(
        `Accounting response contained multiple records for email "${email}" — keeping the last one returned.`,
      );
    }

    assertPopulationSize(identities.length);

    const identityEmails = new Set(
      identities.map((identity) => normalizeEmailKey(identity.email)),
    );
    let orphanedTalentsMemberships = 0;
    for (const project of talents.projects) {
      for (const member of project.members) {
        if (!identityEmails.has(normalizeEmailKey(member.email))) {
          orphanedTalentsMemberships += 1;
          this.logger.warn(
            `Talents membership skipped — email "${member.email}" on project "${project.name}" ` +
              'has no matching Accounting-endpoint identity.',
          );
        }
      }
    }

    // ---- Write phase — both preconditions above held, so it's safe to start ----
    let identitiesUpserted = 0;
    for (const identity of identities) {
      await this.upsertIdentity(identity, now);
      identitiesUpserted += 1;
    }

    this.logger.log(
      `Seed complete: ${identitiesUpserted} identities upserted, ${duplicateEmails.length} duplicate ` +
        `email(s) deduped, ${orphanedTalentsMemberships} orphaned Talents membership(s) skipped.`,
    );

    return {
      identitiesUpserted,
      duplicateEmailsSkipped: duplicateEmails.length,
      orphanedTalentsMemberships,
    };
  }

  /**
   * Upserts by the unique `email` (spec Boundaries — never a new insert on
   * rerun) and keeps the TimeTracker-sourced fields in sync with the latest
   * fetch. `Employee` is 1:1 and has no TimeTracker-sourced fields of its
   * own, so it only ever needs a bare create-if-missing.
   */
  private async upsertIdentity(
    identity: TimetrackerEmployee,
    now: Date,
  ): Promise<void> {
    const user = await this.prisma.user.upsert({
      where: { email: identity.email },
      update: {
        name: identity.name,
        hash: identity.hash,
        countryCode: identity.countryCode,
      },
      create: {
        email: identity.email,
        name: identity.name,
        hash: identity.hash,
        countryCode: identity.countryCode,
      },
    });

    const employee = await this.prisma.employee.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });

    await this.seedInitialHistory(employee.id, identity.email, now);
  }

  /**
   * Synthetic layer (spec Approach): TimeTracker carries no grade/position/
   * department/employmentType, so a first-seen employee gets a deterministic
   * synthetic starting value for each, written through the real
   * temporal-history Prisma Client Extension — Story 1.20's only legal write
   * path (never a raw/bulk insert).
   *
   * Only runs when the employee has no open row yet for a given dimension.
   * The extension's `create` always closes-and-inserts a new row, so calling
   * it unconditionally on every rerun would create a new history row (and
   * fire a new C4 event) every single time — breaking the "rerunning
   * creates no duplicates" idempotency guarantee. Synthetic history values
   * are not TimeTracker-sourced, so there is nothing to "keep in sync" here
   * the way there is for User's TimeTracker-sourced fields.
   */
  private async seedInitialHistory(
    employeeId: string,
    seedKey: string,
    now: Date,
  ): Promise<void> {
    const profile = buildSyntheticProfile(seedKey, now);
    const { effectiveFrom } = profile;

    await this.createIfNoOpenRow(
      () =>
        this.prisma.gradeHistory.findFirst({
          where: { employeeId, effectiveTo: null },
        }),
      () =>
        this.prisma.gradeHistory.create({
          data: { employeeId, value: profile.grade, effectiveFrom },
        }),
    );
    await this.createIfNoOpenRow(
      () =>
        this.prisma.positionHistory.findFirst({
          where: { employeeId, effectiveTo: null },
        }),
      () =>
        this.prisma.positionHistory.create({
          data: { employeeId, value: profile.position, effectiveFrom },
        }),
    );
    await this.createIfNoOpenRow(
      () =>
        this.prisma.departmentHistory.findFirst({
          where: { employeeId, effectiveTo: null },
        }),
      () =>
        this.prisma.departmentHistory.create({
          data: { employeeId, value: profile.department, effectiveFrom },
        }),
    );
    await this.createIfNoOpenRow(
      () =>
        this.prisma.employmentTypeHistory.findFirst({
          where: { employeeId, effectiveTo: null },
        }),
      () =>
        this.prisma.employmentTypeHistory.create({
          data: { employeeId, value: profile.employmentType, effectiveFrom },
        }),
    );
  }

  private async createIfNoOpenRow(
    findOpenRow: () => Promise<{ id: string } | null>,
    createRow: () => Promise<unknown>,
  ): Promise<void> {
    const openRow = await findOpenRow();
    if (openRow) {
      return;
    }
    await createRow();
  }
}
