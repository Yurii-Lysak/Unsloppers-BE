import { Injectable } from '@nestjs/common';
import {
  AccessResolver,
  AccessRole,
} from '../contracts/access-resolver.contract';
import { FieldVisibility } from '../contracts/field-registry.contract';

@Injectable()
export class CustomFieldVisibilityService {
  constructor(private readonly accessResolver: AccessResolver) {}

  /** Whether a field's visibility tier is visible to the resolved access role. */
  isVisibleToRole(role: AccessRole, visibility: FieldVisibility): boolean {
    switch (visibility) {
      case 'management':
        return role === 'ManagerLine' || role === 'PP' || role === 'HRAdmin';
      case 'employee':
        return (
          role === 'ManagerLine' ||
          role === 'PP' ||
          role === 'HRAdmin' ||
          role === 'Self'
        );
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

  /** For definition pickers: field visible when S16 grants read and visibility matches role. */
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
    return this.isVisibleToRole(audience.role, visibility);
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
