import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AccessResolver,
  AccessRole,
  COLLEAGUE_SECTION_GRANTS,
  ResolvedAudience,
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
  constructor(
    private readonly accessResolver: AccessResolver,
    private readonly prisma: PrismaService,
  ) {}

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
    viewerEmployeeId: string,
    subjectEmployeeId: string,
    visibility: FieldVisibility,
  ): Promise<boolean> {
    const audience = await this.accessResolver.resolveAudience(
      viewerEmployeeId,
      subjectEmployeeId,
    );
    const s16Access = audience.sections.S16;
    if (s16Access === 'none') {
      return false;
    }
    return this.isVisibleToRole(audience.role, visibility);
  }

  /**
   * Directory definition catalog: never use Self resolution (over-permits S16).
   * Resolve peer grants instead so Colleague-tier viewers see no metadata.
   */
  async canViewFieldDefinition(
    viewerEmployeeId: string,
    visibility: FieldVisibility,
  ): Promise<boolean> {
    const audience = await this.resolveCatalogAudience(viewerEmployeeId);
    if (audience.sections.S16 === 'none') {
      return false;
    }
    return this.isVisibleToRoleForDefinitionList(audience.role, visibility);
  }

  private async resolveCatalogAudience(
    viewerEmployeeId: string,
  ): Promise<ResolvedAudience> {
    const report = await this.prisma.employee.findFirst({
      where: { managerId: viewerEmployeeId },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    if (report) {
      return this.accessResolver.resolveAudience(viewerEmployeeId, report.id);
    }

    const peer = await this.prisma.employee.findFirst({
      where: { id: { not: viewerEmployeeId } },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    if (!peer) {
      return { role: 'Colleague', sections: { ...COLLEAGUE_SECTION_GRANTS } };
    }
    return this.accessResolver.resolveAudience(viewerEmployeeId, peer.id);
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
        return role === 'Colleague' || hasManagementVisibility(role);
      default: {
        const _exhaustive: never = visibility;
        return _exhaustive;
      }
    }
  }

  async canWriteFieldForSubject(
    viewerEmployeeId: string,
    subjectEmployeeId: string,
    visibility: FieldVisibility,
  ): Promise<boolean> {
    const audience = await this.accessResolver.resolveAudience(
      viewerEmployeeId,
      subjectEmployeeId,
    );
    if (audience.sections.S16 !== 'RW') {
      return false;
    }
    return this.isVisibleToRole(audience.role, visibility);
  }
}
