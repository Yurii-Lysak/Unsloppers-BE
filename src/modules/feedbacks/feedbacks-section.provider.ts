import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  AccessResolver,
  ResolvedAudience,
} from '../contracts/access-resolver.contract';
import { SectionProvider } from '../contracts/section-provider.contract';
import { RegisterProvider } from '../registry/register-provider.decorator';
import { FeedbackSectionEntity } from './entities/feedback-record.entity';
import { FeedbacksService } from './feedbacks.service';

@Injectable()
@RegisterProvider('section', 'S8')
export class FeedbacksSectionProvider extends SectionProvider {
  constructor(
    private readonly feedbacks: FeedbacksService,
    private readonly accessResolver: AccessResolver,
  ) {
    super();
  }

  async getSection(
    viewerEmployeeId: string,
    subjectEmployeeId: string,
    audience?: ResolvedAudience,
  ): Promise<FeedbackSectionEntity> {
    const resolved =
      audience ??
      (await this.accessResolver.resolveAudience(
        viewerEmployeeId,
        subjectEmployeeId,
      ));
    const accessLevel = resolved.sections.S8;
    if (accessLevel === 'none') {
      throw new ForbiddenException('S8 is not visible to this viewer');
    }

    return this.feedbacks.buildSection(
      subjectEmployeeId,
      resolved,
      accessLevel,
    );
  }
}
