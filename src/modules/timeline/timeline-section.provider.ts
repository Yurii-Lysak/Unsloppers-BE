import { Injectable } from '@nestjs/common';
import { ResolvedAudience } from '../contracts/access-resolver.contract';
import { SectionProvider } from '../contracts/section-provider.contract';
import { RegisterProvider } from '../registry/register-provider.decorator';
import { TimelineSectionEntity } from './entities/timeline-section.entity';
import { TimelineService } from './timeline.service';

@Injectable()
@RegisterProvider('section', 'S9')
export class TimelineSectionProvider extends SectionProvider {
  constructor(private readonly timeline: TimelineService) {
    super();
  }

  async getSection(
    viewerId: string,
    employeeId: string,
    audience?: ResolvedAudience,
  ): Promise<TimelineSectionEntity> {
    const events = await this.timeline.listEvents(
      viewerId,
      employeeId,
      audience,
    );
    return { events };
  }
}
