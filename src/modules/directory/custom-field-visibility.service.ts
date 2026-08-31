import { Injectable } from '@nestjs/common';
import {
  AccessResolver,
  AccessRole,
} from '../contracts/access-resolver.contract';
import { FieldVisibility } from '../contracts/field-registry.contract';

/** Roles that may see management-tier custom fields (PRD 3.3.5 / AD-2). */
const MANAGEMENT_VISIBILITY_ROLES: readonly AccessRole[] = [
  'ReportingLine',
  'ProjectLine',
  'PP',
  'FullAccess',
];

function hasManagementVisibility(role: AccessRole): boolean {
  return MANAGEMENT_VISIBILITY_ROLES.includes(role);
}

@Injectable()
export class CustomFieldVisibilityService {
  constructor(private readonly accessResolver: AccessResolver) {}

  /** Whether a field's visibility tier is visible to the resolved access role. */
  isVisibleToRole(role: AccessRole, visibility: FieldVisibility): boolean {
    switch (visibility) {
      case 'management':
        return hasManagementVisibility(role);
      case 'employee':
        return hasManagementVisibility(role) || role === 'Self';
      case 'colleague':
        return true;
      default: {
        const _exhaustive: never = visibility;
        return _exhaustive;
      }
    }
  }

  /** S16 must grant read/write; field visibility tier must match the viewer role. */
  async canViewFieldForSubject(
    viewerId: string,
    subjectEmployeeId: string,
    visibility: FieldVisibility,
  ): Promise<boolean> {
    const audience = await this.accessResolver.resolveAudience(
      viewerId,
      subjectEmployeeId,
    );
    const s16Access = audience.sections.S16;
    if (s16Access === 'none') {
      return false;
    }
    return this.isVisibleToRole(audience.role, visibility);
  }

  /**
   * For directory definition lists: S16 must grant read and the visibility tier
   * must be visible in peer/directory context. Self-role resolution over-permits
   * employee-tier metadata (every user is Self to themselves), so employee-tier
   * definitions require a management role here — subject-scoped reads use
   * `canViewFieldForSubject` instead.
   */
  async canViewFieldDefinition(
    viewerId: string,
    visibility: FieldVisibility,
  ): Promise<boolean> {
    const audience = await this.accessResolver.resolveAudience(
      viewerId,
      viewerId,
    );
    if (audience.sections.S16 === 'none') {
      return false;
    }
    return this.isVisibleToRoleForDefinitionList(audience.role, visibility);
  }

  private isVisibleToRoleForDefinitionList(
    role: AccessRole,
    visibility: FieldVisibility,
  ): boolean {
    switch (visibility) {
      case 'management':
        return hasManagementVisibility(role);
      case 'employee':
        return hasManagementVisibility(role);
      case 'colleague':
        return true;
      default: {
        const _exhaustive: never = visibility;
        return _exhaustive;
      }
    }
  }

  async canWriteFieldForSubject(
    viewerId: string,
    subjectEmployeeId: string,
    visibility: FieldVisibility,
  ): Promise<boolean> {
    const audience = await this.accessResolver.resolveAudience(
      viewerId,
      subjectEmployeeId,
    );
    if (audience.sections.S16 !== 'RW') {
      return false;
    }
    return this.isVisibleToRole(audience.role, visibility);
  }
}
