import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  assertNonEmptySeedPopulation,
  dedupeIdentitiesByEmail,
  normalizeEmailKey,
} from './seed.helpers';
import {
  BootcampIdentity,
  loadBootcampSeedManifest,
} from './seed.manifest';
import { buildSyntheticProfile } from './seed.synthetic';

export interface SeedSummary {
  identitiesUpserted: number;
  duplicateEmailsSkipped: number;
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
    private readonly manifestPath?: string,
  ) {}

  async run(now: Date = new Date()): Promise<SeedSummary> {
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

    this.logger.log(
      `Seed complete: ${identitiesUpserted} identities upserted, ${duplicateEmails.length} duplicate ` +
        `email(s) deduped.`,
    );

    return {
      identitiesUpserted,
      duplicateEmailsSkipped: duplicateEmails.length,
    };
  }

  private async upsertIdentity(
    identity: BootcampIdentity,
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
