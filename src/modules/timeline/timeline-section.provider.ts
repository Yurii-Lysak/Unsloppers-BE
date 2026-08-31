import { Injectable } from '@nestjs/common';
import { RegisterProvider } from '../registry/register-provider.decorator';
import { TimelineSectionEntity } from './entities/timeline-section.entity';
import { TimelineService } from './timeline.service';

@Injectable()
@RegisterProvider('section', 'S9')
export class TimelineSectionProvider {
  constructor(private readonly timeline: TimelineService) {}

  async getSection(
    viewerId: string,
    employeeId: string,
  ): Promise<TimelineSectionEntity> {
    const events = await this.timeline.listEvents(viewerId, employeeId);
    return { events };
  }
}
