import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  AccessResolver,
  ResolvedAudience,
} from '../contracts/access-resolver.contract';
import { FieldRegistry, FieldSpec } from '../contracts/field-registry.contract';
import { SectionProvider } from '../contracts/section-provider.contract';
import { RegisterProvider } from '../registry/register-provider.decorator';
import { CustomFieldVisibilityService } from './custom-field-visibility.service';
import { CustomFieldsSectionEntity } from './entities/custom-fields-section.entity';

/** `FieldSpec` narrowed to only entries `FieldRegistry.listFields()` marks as custom. */
type CustomFieldSpec = FieldSpec & {
  source: 'custom';
  visibility: NonNullable<FieldSpec['visibility']>;
};

function isCustomFieldSpec(field: FieldSpec): field is CustomFieldSpec {
  return field.source === 'custom' && field.visibility !== undefined;
}

/**
 * S16 — Custom fields section provider (Story 1.10).
 *
 * Mirrors `ManagementNotesSectionProvider`: resolves audience if not
 * supplied, throws when the section grant is `'none'`, else assembles the
 * section. Per-field filtering always goes through
 * `CustomFieldVisibilityService.isVisibleToRole`, applied to the audience
 * already resolved above — never a per-field `resolveAudience` call, and
 * never the `manage_custom_fields` HR-admin bypass used by
 * `CustomFieldsService.listValuesForEmployee`, which is specific to the
 * field-administration API and never applies to profile viewing.
 */
@Injectable()
@RegisterProvider('section', 'S16')
export class CustomFieldsSectionProvider extends SectionProvider {
  constructor(
    private readonly fieldRegistry: FieldRegistry,
    private readonly visibility: CustomFieldVisibilityService,
    private readonly accessResolver: AccessResolver,
  ) {
    super();
  }

  async getSection(
    viewerEmployeeId: string,
    subjectEmployeeId: string,
    audience?: ResolvedAudience,
  ): Promise<CustomFieldsSectionEntity> {
    const resolved =
      audience ??
      (await this.accessResolver.resolveAudience(
        viewerEmployeeId,
        subjectEmployeeId,
      ));
    const accessLevel = resolved.sections.S16;
    if (accessLevel === 'none') {
      throw new ForbiddenException('S16 is not visible to this viewer');
    }

    const allFields = await this.fieldRegistry.listFields();
    const customFields = allFields.filter(isCustomFieldSpec);

    // `resolved.role` is already known for this viewer/subject pair, so the
    // per-field check is a synchronous lookup against `isVisibleToRole` —
    // never a fresh `resolveAudience` per field.
    const visibleFields = customFields.filter((field) =>
      this.visibility.isVisibleToRole(resolved.role, field.visibility),
    );

    if (visibleFields.length === 0) {
      return { fields: [], values: {} };
    }

    const rows = await this.fieldRegistry.query({
      employeeIds: [subjectEmployeeId],
      fieldIds: visibleFields.map((field) => field.id),
    });

    const values: CustomFieldsSectionEntity['values'] = {};
    for (const row of rows) {
      values[row.fieldId] = row.value;
    }

    return {
      fields: visibleFields.map((field) => ({
        id: field.id,
        name: field.name,
        type: field.type,
      })),
      values,
    };
  }
}
