import { Logger } from '@nestjs/common';
import { hash as hashPassword } from 'bcryptjs';
import { isBcryptInputWithinLimit } from '../../common/security/bcrypt-input';
import { PrismaService } from '../prisma.service';
import {
  InitialPasswordMissingError,
  InitialPasswordTooLongError,
} from './seed.errors';
import {
  assertNonEmptySeedPopulation,
  dedupeIdentitiesByEmail,
  normalizeEmailKey,
} from './seed.helpers';
import { BootcampIdentity, loadBootcampSeedManifest } from './seed.manifest';
import { buildSyntheticProfile } from './seed.synthetic';
import { seedFunctionalRoles } from './seed.functional-roles';
import { FunctionalRoleAssignmentService } from '../../modules/access/functional-role-assignment.service';

export interface SeedSummary {
  identitiesUpserted: number;
  duplicateEmailsSkipped: number;
  functionalRolesUpserted: number;
  hrAdminAssignments: number;
}

/**
 * Seeds the platform from the bundled bootcamp identity manifest
 * (`src/prisma/seed/data/bootcamp-identities.json`). Archive copy:
 * `_bmad-output/archive/bootcamp-seed-identities.json` in the workspace repo.
 *
 * Kept out of `prisma/seed.ts` so it can be unit-tested under Jest.
 */
export class SeedService {
  private readonly logger = new Logger('SeedService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly initialPassword?: string,
    private readonly manifestPath?: string,
  ) {}

  async run(now: Date = new Date()): Promise<SeedSummary> {
    if (!this.initialPassword?.trim()) {
      throw new InitialPasswordMissingError();
    }
    if (!isBcryptInputWithinLimit(this.initialPassword)) {
      throw new InitialPasswordTooLongError();
    }

    this.logger.log('Loading bootcamp seed manifest...');
    const manifest = loadBootcampSeedManifest(this.manifestPath);

    const { identities, duplicateEmails } = dedupeIdentitiesByEmail(
      manifest.identities,
    );
    for (const email of duplicateEmails) {
      this.logger.warn(
        `Seed manifest contained multiple records for email "${email}" — keeping the last one.`,
      );
    }

    assertNonEmptySeedPopulation(identities.length);

    this.logger.log(
      `Seeding ${identities.length} bootcamp identit${identities.length === 1 ? 'y' : 'ies'} ` +
        `(manifest v${manifest.version}${manifest.description ? `: ${manifest.description}` : ''})...`,
    );

    let identitiesUpserted = 0;
    for (const identity of identities) {
      await this.upsertIdentity(identity, now);
      identitiesUpserted += 1;
    }

    const assignmentService = new FunctionalRoleAssignmentService(this.prisma);
    const functionalRoleSeed = await seedFunctionalRoles(
      this.prisma,
      assignmentService,
      this.manifestPath,
      this.logger,
    );

    this.logger.log(
      `Seed complete: ${identitiesUpserted} identities upserted, ${duplicateEmails.length} duplicate ` +
        `email(s) deduped, ${functionalRoleSeed.rolesUpserted} built-in functional roles upserted.`,
    );

    return {
      identitiesUpserted,
      duplicateEmailsSkipped: duplicateEmails.length,
      functionalRolesUpserted: functionalRoleSeed.rolesUpserted,
      hrAdminAssignments: functionalRoleSeed.hrAdminAssignments,
    };
  }

  private async upsertIdentity(
    identity: BootcampIdentity,
    now: Date,
  ): Promise<void> {
    const existing = await this.prisma.user.findUnique({
      where: { email: identity.email },
      select: { id: true, passwordHash: true },
    });
    const passwordHash =
      existing?.passwordHash == null
        ? await hashPassword(this.initialPassword!, 12)
        : undefined;
    if (existing && passwordHash) {
      await this.prisma.user.updateMany({
        where: { id: existing.id, passwordHash: null },
        data: { passwordHash },
      });
    }

    const user = await this.prisma.user.upsert({
      where: { email: identity.email },
      update: {
        name: identity.name,
        countryCode: identity.countryCode,
      },
      create: {
        email: identity.email,
        name: identity.name,
        hash: identity.hash,
        passwordHash,
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

/** Exported for orphan checks if TimeTracker project sync is reintroduced later. */
export { normalizeEmailKey };
