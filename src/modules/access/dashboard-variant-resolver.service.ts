import { Injectable } from '@nestjs/common';
import {
  BUILT_IN_ROLE_NAMES,
  PERMISSION_KEYS,
} from '../contracts/permission-keys';
import {
  DashboardVariant,
  DashboardVariantResolution,
  DashboardVariantResolver,
} from '../contracts/dashboard-variant-resolver.contract';
import { PrismaService } from '../../prisma/prisma.service';
import { FunctionalRoleAssignmentService } from './functional-role-assignment.service';

const VARIANT_PRIORITY: ReadonlyArray<{
  variant: DashboardVariant;
  roleName: (typeof BUILT_IN_ROLE_NAMES)[keyof typeof BUILT_IN_ROLE_NAMES];
}> = [
  { variant: 'um', roleName: BUILT_IN_ROLE_NAMES.UNIT_MANAGER },
  { variant: 'dm', roleName: BUILT_IN_ROLE_NAMES.DELIVERY_MANAGER },
  { variant: 'pm', roleName: BUILT_IN_ROLE_NAMES.PROJECT_MANAGER },
  { variant: 'pp', roleName: BUILT_IN_ROLE_NAMES.PEOPLE_PARTNER },
];

/**
 * Bootcamp seed fallback until functional-role UI selects the home variant.
 * E2e tests should prefer assigning built-in roles directly.
 */
const SEED_VARIANT_BY_MANIFEST_ID: Readonly<Record<number, DashboardVariant>> =
  {
    2: 'um',
    3: 'dm',
  };

@Injectable()
export class DashboardVariantResolverService extends DashboardVariantResolver {
  constructor(
    private readonly assignments: FunctionalRoleAssignmentService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async resolveVariant(
    viewerEmployeeId: string,
  ): Promise<DashboardVariantResolution> {
    const roles = await this.assignments.listForEmployee(viewerEmployeeId);
    for (const entry of VARIANT_PRIORITY) {
      const role = roles.find((candidate) => candidate.name === entry.roleName);
      if (
        role &&
        role.permissionKeys.includes(PERMISSION_KEYS.VIEW_DASHBOARD)
      ) {
        return { variant: entry.variant, resolvedBy: 'functional-role' };
      }
    }

    const seedVariant = await this.resolveFromSeedMap(viewerEmployeeId);
    if (seedVariant) {
      return { variant: seedVariant, resolvedBy: 'seed-map' };
    }

    return { variant: null, resolvedBy: 'seed-map' };
  }

  private async resolveFromSeedMap(
    viewerEmployeeId: string,
  ): Promise<DashboardVariant | null> {
    const identity = await this.prisma.externalIdentity.findFirst({
      where: {
        employeeId: viewerEmployeeId,
        system: 'timetracker',
      },
      select: { externalId: true },
    });
    if (!identity) {
      return null;
    }

    const manifestId = Number.parseInt(identity.externalId, 10);
    if (!Number.isFinite(manifestId)) {
      return null;
    }

    return SEED_VARIANT_BY_MANIFEST_ID[manifestId] ?? null;
  }
}
