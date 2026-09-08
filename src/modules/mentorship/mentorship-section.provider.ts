import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  AccessResolver,
  ResolvedAudience,
} from '../contracts/access-resolver.contract';
import { SectionProvider } from '../contracts/section-provider.contract';
import { RegisterProvider } from '../registry/register-provider.decorator';
import { MentorshipSectionEntity } from './entities/mentorship-section.entity';
import { MentorshipService } from './mentorship.service';

@Injectable()
@RegisterProvider('section', 'S13')
export class MentorshipSectionProvider extends SectionProvider {
  constructor(
    private readonly mentorship: MentorshipService,
    private readonly accessResolver: AccessResolver,
  ) {
    super();
  }

  async getSection(
    viewerEmployeeId: string,
    subjectEmployeeId: string,
    audience?: ResolvedAudience,
  ): Promise<MentorshipSectionEntity> {
    const resolved =
      audience ??
      (await this.accessResolver.resolveAudience(
        viewerEmployeeId,
        subjectEmployeeId,
      ));
    const accessLevel = resolved.sections.S13;
    if (accessLevel === 'none') {
      throw new ForbiddenException('S13 is not visible to this viewer');
    }

    return this.mentorship.buildSection(subjectEmployeeId);
  }
}
