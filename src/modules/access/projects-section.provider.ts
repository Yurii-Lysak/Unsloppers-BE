import { Injectable } from '@nestjs/common';
import { ResolvedAudience } from '../contracts/access-resolver.contract';
import { ProjectAssignment } from '../contracts/project-assignment.contract';
import { SectionProvider } from '../contracts/section-provider.contract';
import { RegisterProvider } from '../registry/register-provider.decorator';
import { ProjectsSectionDto } from './entities/projects-section.entity';

/**
 * Story 1.6 minimal S11 stub — project names only. PM/DM/period deferred to the
 * resourcing epic provider. `projectId` serves as the display label until a
 * Project directory entity exists. Colleague viewers receive name-only entries.
 */
@Injectable()
@RegisterProvider('section', 'S11')
export class ProjectsSectionProvider extends SectionProvider {
  constructor(private readonly projectAssignment: ProjectAssignment) {
    super();
  }

  async getSection(
    _viewerId: string,
    subjectId: string,
    audience?: ResolvedAudience,
  ): Promise<ProjectsSectionDto> {
    const rows = await this.projectAssignment.listByEmployee(subjectId);
    const projects = rows.map((row) => ({ name: row.projectId }));

    if (audience?.role === 'Colleague') {
      return { projects };
    }

    return { projects };
  }
}
