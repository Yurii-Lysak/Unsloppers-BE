import { Logger } from '@nestjs/common';
import {
  BUILT_IN_ROLE_NAMES,
  BOOTCAMP_SITE_ADMIN_MANIFEST_ID,
  PERMISSION_KEYS,
  type PermissionKey,
} from '../../modules/contracts/permission-keys';
import { PrismaService } from '../prisma.service';
import { FunctionalRoleAssignmentService } from '../../modules/access/functional-role-assignment.service';
import { BootcampIdentity, loadBootcampSeedManifest } from './seed.manifest';

const BUILT_IN_ROLE_PERMISSIONS: Record<
  (typeof BUILT_IN_ROLE_NAMES)[keyof typeof BUILT_IN_ROLE_NAMES],
  readonly PermissionKey[]
> = {
  [BUILT_IN_ROLE_NAMES.HR_ADMIN]: [
    PERMISSION_KEYS.CHANGE_ORGANISATIONAL_RELATIONSHIPS,
    PERMISSION_KEYS.MANAGE_CUSTOM_FIELDS,
    PERMISSION_KEYS.MANAGE_DEPARTMENTS,
    PERMISSION_KEYS.MANAGE_FUNCTIONAL_ROLES,
  ],
  [BUILT_IN_ROLE_NAMES.UNIT_MANAGER]: [
    PERMISSION_KEYS.ASSIGN_END_MENTORSHIPS,
    PERMISSION_KEYS.CREATE_ACTION_ITEMS,
    PERMISSION_KEYS.CREATE_EDIT_RISKS,
    PERMISSION_KEYS.CREATE_FEEDBACK,
    PERMISSION_KEYS.EDIT_CAREER_TIMELINE,
    PERMISSION_KEYS.FULFIL_RESOURCING_REQUESTS,
    PERMISSION_KEYS.MAINTAIN_CDS_RECORDS,
    PERMISSION_KEYS.MANAGE_CUSTOM_FIELDS,
    PERMISSION_KEYS.VIEW_DASHBOARD,
  ],
  [BUILT_IN_ROLE_NAMES.DELIVERY_MANAGER]: [
    PERMISSION_KEYS.APPROVE_REJECT_CANDIDATES,
    PERMISSION_KEYS.ASSIGN_END_MENTORSHIPS,
    PERMISSION_KEYS.CLOSE_RESOURCING_REQUESTS,
    PERMISSION_KEYS.CREATE_ACTION_ITEMS,
    PERMISSION_KEYS.CREATE_EDIT_RISKS,
    PERMISSION_KEYS.CREATE_FEEDBACK,
    PERMISSION_KEYS.CREATE_RESOURCING_REQUESTS,
    PERMISSION_KEYS.MAINTAIN_CDS_RECORDS,
    PERMISSION_KEYS.MANAGE_CUSTOM_FIELDS,
    PERMISSION_KEYS.VIEW_DASHBOARD,
  ],
  [BUILT_IN_ROLE_NAMES.PROJECT_MANAGER]: [
    PERMISSION_KEYS.ASSIGN_END_MENTORSHIPS,
    PERMISSION_KEYS.CREATE_ACTION_ITEMS,
    PERMISSION_KEYS.CREATE_EDIT_RISKS,
    PERMISSION_KEYS.CREATE_FEEDBACK,
    PERMISSION_KEYS.CREATE_RESOURCING_REQUESTS,
    PERMISSION_KEYS.MAINTAIN_CDS_RECORDS,
    PERMISSION_KEYS.MANAGE_CUSTOM_FIELDS,
    PERMISSION_KEYS.VIEW_DASHBOARD,
  ],
  [BUILT_IN_ROLE_NAMES.PEOPLE_PARTNER]: [
    PERMISSION_KEYS.ASSIGN_END_MENTORSHIPS,
    PERMISSION_KEYS.CREATE_EDIT_RISKS,
    PERMISSION_KEYS.CREATE_FEEDBACK,
    PERMISSION_KEYS.CREATE_FORM_CAMPAIGNS,
    PERMISSION_KEYS.EDIT_CAREER_TIMELINE,
    PERMISSION_KEYS.MAINTAIN_CDS_RECORDS,
    PERMISSION_KEYS.RECORD_DEPARTURE,
    PERMISSION_KEYS.VIEW_DASHBOARD,
  ],
};

export interface FunctionalRoleSeedSummary {
  rolesUpserted: number;
  hrAdminAssignments: number;
}

/**
 * Idempotent upsert of built-in functional roles, D11 default permissions, and
 * HR Admin bootstrap assignment for the Site Administrator manifest entry.
 */
export async function seedFunctionalRoles(
  prisma: PrismaService,
  assignmentService: FunctionalRoleAssignmentService,
  manifestPath?: string,
  logger: Pick<Logger, 'log'> = new Logger('FunctionalRoleSeed'),
): Promise<FunctionalRoleSeedSummary> {
  let rolesUpserted = 0;

  for (const [name, permissionKeys] of Object.entries(
    BUILT_IN_ROLE_PERMISSIONS,
  )) {
    const existing = await prisma.functionalRole.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      include: { permissions: true },
    });

    const role = existing
      ? await prisma.functionalRole.update({
          where: { id: existing.id },
          data: { isBuiltIn: true },
          include: { permissions: true },
        })
      : await prisma.functionalRole.create({
          data: {
            name,
            isBuiltIn: true,
            permissions: {
              create: permissionKeys.map((permissionKey) => ({ permissionKey })),
            },
          },
          include: { permissions: true },
        });

    const desired = new Set(permissionKeys);
    const existingKeys = new Set(role.permissions.map((p) => p.permissionKey));

    for (const key of desired) {
      if (!existingKeys.has(key)) {
        await prisma.functionalRolePermission.create({
          data: { roleId: role.id, permissionKey: key },
        });
      }
    }
    for (const key of existingKeys) {
      if (!desired.has(key as PermissionKey)) {
        await prisma.functionalRolePermission.deleteMany({
          where: { roleId: role.id, permissionKey: key },
        });
      }
    }

    rolesUpserted += 1;
  }

  const hrAdminRole = await prisma.functionalRole.findFirstOrThrow({
    where: {
      name: { equals: BUILT_IN_ROLE_NAMES.HR_ADMIN, mode: 'insensitive' },
    },
  });

  const manifest = loadBootcampSeedManifest(manifestPath);
  const siteAdmin = findManifestIdentity(manifest.identities);
  const employee = await prisma.employee.findFirst({
    where: { user: { email: siteAdmin.email } },
    select: { id: true },
  });

  if (!employee) {
    throw new Error(
      `Site Administrator employee not found for manifest id ${BOOTCAMP_SITE_ADMIN_MANIFEST_ID}`,
    );
  }

  await assignmentService.assign(employee.id, hrAdminRole.id);
  logger.log(
    `Assigned built-in HR Admin role to Site Administrator (manifest id ${BOOTCAMP_SITE_ADMIN_MANIFEST_ID}).`,
  );

  return { rolesUpserted, hrAdminAssignments: 1 };
}

function findManifestIdentity(
  identities: BootcampIdentity[],
): BootcampIdentity {
  const match = identities.find(
    (identity) => identity.id === BOOTCAMP_SITE_ADMIN_MANIFEST_ID,
  );
  if (!match) {
    throw new Error(
      `Bootcamp manifest is missing identity id ${BOOTCAMP_SITE_ADMIN_MANIFEST_ID}`,
    );
  }
  return match;
}
