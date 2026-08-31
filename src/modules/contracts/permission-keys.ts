/**
 * Canonical functional-permission key catalog (`access-model.md` §2.3).
 * Grant rows in the DB reference these strings; adding a new key type requires
 * a deploy that updates this file, not a schema migration.
 */

export const PERMISSION_KEYS = {
  CREATE_FORM_CAMPAIGNS: 'create_form_campaigns',
  CREATE_ACTION_ITEMS: 'create_action_items',
  CREATE_EDIT_RISKS: 'create_edit_risks',
  CREATE_RESOURCING_REQUESTS: 'create_resourcing_requests',
  FULFIL_RESOURCING_REQUESTS: 'fulfil_resourcing_requests',
  APPROVE_REJECT_CANDIDATES: 'approve_reject_candidates',
  CLOSE_RESOURCING_REQUESTS: 'close_resourcing_requests',
  ASSIGN_END_MENTORSHIPS: 'assign_end_mentorships',
  MAINTAIN_CDS_RECORDS: 'maintain_cds_records',
  EDIT_CAREER_TIMELINE: 'edit_career_timeline',
  CREATE_FEEDBACK: 'create_feedback',
  RECORD_DEPARTURE: 'record_departure',
  MANAGE_CUSTOM_FIELDS: 'manage_custom_fields',
  MANAGE_DEPARTMENTS: 'manage_departments',
  CHANGE_ORGANISATIONAL_RELATIONSHIPS: 'change_organisational_relationships',
  VIEW_DASHBOARD: 'view_dashboard',
  MANAGE_FUNCTIONAL_ROLES: 'manage_functional_roles',
} as const;

export type PermissionKey =
  (typeof PERMISSION_KEYS)[keyof typeof PERMISSION_KEYS];

export interface PermissionCatalogEntry {
  key: PermissionKey;
  label: string;
  description?: string;
}

const PERMISSION_CATALOG: PermissionCatalogEntry[] = [
  {
    key: PERMISSION_KEYS.CREATE_FORM_CAMPAIGNS,
    label: 'Create form campaigns',
  },
  {
    key: PERMISSION_KEYS.CREATE_ACTION_ITEMS,
    label: 'Create action items',
  },
  {
    key: PERMISSION_KEYS.CREATE_EDIT_RISKS,
    label: 'Create and edit risks',
  },
  {
    key: PERMISSION_KEYS.CREATE_RESOURCING_REQUESTS,
    label: 'Create resourcing requests',
  },
  {
    key: PERMISSION_KEYS.FULFIL_RESOURCING_REQUESTS,
    label: 'Fulfil resourcing requests',
  },
  {
    key: PERMISSION_KEYS.APPROVE_REJECT_CANDIDATES,
    label: 'Approve or reject proposed candidates',
  },
  {
    key: PERMISSION_KEYS.CLOSE_RESOURCING_REQUESTS,
    label: 'Close resourcing requests',
  },
  {
    key: PERMISSION_KEYS.ASSIGN_END_MENTORSHIPS,
    label: 'Assign and end mentorships',
  },
  {
    key: PERMISSION_KEYS.MAINTAIN_CDS_RECORDS,
    label: 'Maintain CDS records',
  },
  {
    key: PERMISSION_KEYS.EDIT_CAREER_TIMELINE,
    label: 'Edit the career timeline',
  },
  {
    key: PERMISSION_KEYS.CREATE_FEEDBACK,
    label: 'Create feedback',
  },
  {
    key: PERMISSION_KEYS.RECORD_DEPARTURE,
    label: 'Record a departure',
  },
  {
    key: PERMISSION_KEYS.MANAGE_CUSTOM_FIELDS,
    label: 'Manage custom fields',
  },
  {
    key: PERMISSION_KEYS.MANAGE_DEPARTMENTS,
    label: 'Manage departments',
  },
  {
    key: PERMISSION_KEYS.CHANGE_ORGANISATIONAL_RELATIONSHIPS,
    label: 'Change organisational relationships',
  },
  {
    key: PERMISSION_KEYS.VIEW_DASHBOARD,
    label: 'View a dashboard',
  },
  {
    key: PERMISSION_KEYS.MANAGE_FUNCTIONAL_ROLES,
    label: 'Manage functional roles',
  },
];

const VALID_KEY_SET = new Set<string>(
  PERMISSION_CATALOG.map((entry) => entry.key),
);

export function getPermissionCatalog(): PermissionCatalogEntry[] {
  return [...PERMISSION_CATALOG];
}

export function isValidPermissionKey(key: string): key is PermissionKey {
  return VALID_KEY_SET.has(key);
}

export function assertValidPermissionKeys(keys: string[]): PermissionKey[] {
  const invalid = keys.filter((key) => !isValidPermissionKey(key));
  if (invalid.length > 0) {
    throw new InvalidPermissionKeysError(invalid);
  }
  return keys as PermissionKey[];
}

export function filterCatalogValidKeys(keys: string[]): PermissionKey[] {
  return keys.filter(isValidPermissionKey);
}

export class InvalidPermissionKeysError extends Error {
  constructor(readonly invalidKeys: string[]) {
    super(`Unknown permission key(s): ${invalidKeys.join(', ')}`);
    this.name = 'InvalidPermissionKeysError';
  }
}

/** Built-in functional role display names (`access-model.md` §2.2). */
export const BUILT_IN_ROLE_NAMES = {
  UNIT_MANAGER: 'Unit Manager',
  DELIVERY_MANAGER: 'Delivery Manager',
  PROJECT_MANAGER: 'Project Manager',
  PEOPLE_PARTNER: 'People Partner',
  HR_ADMIN: 'HR Admin',
} as const;

/** Bootcamp manifest entry id for the Site Administrator (HR Admin bootstrap). */
export const BOOTCAMP_SITE_ADMIN_MANIFEST_ID = 1;
