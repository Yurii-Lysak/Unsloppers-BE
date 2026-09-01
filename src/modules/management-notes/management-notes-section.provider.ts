import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  AccessResolver,
  ResolvedAudience,
} from '../contracts/access-resolver.contract';
import { SectionProvider } from '../contracts/section-provider.contract';
import { RegisterProvider } from '../registry/register-provider.decorator';
import { ManagementNotesService } from './management-notes.service';
import { ManagementNotesSectionEntity } from './entities/management-note.entity';

@Injectable()
@RegisterProvider('section', 'S7')
export class ManagementNotesSectionProvider extends SectionProvider {
  constructor(
    private readonly managementNotes: ManagementNotesService,
    private readonly accessResolver: AccessResolver,
  ) {
    super();
  }

  async getSection(
    viewerEmployeeId: string,
    subjectEmployeeId: string,
    audience?: ResolvedAudience,
  ): Promise<ManagementNotesSectionEntity> {
    const resolved =
      audience ??
      (await this.accessResolver.resolveAudience(
        viewerEmployeeId,
        subjectEmployeeId,
      ));
    const accessLevel = resolved.sections.S7;
    if (accessLevel === 'none') {
      throw new ForbiddenException('S7 is not visible to this viewer');
    }

    return this.managementNotes.buildSection(
      subjectEmployeeId,
      resolved,
      accessLevel,
    );
  }
}
