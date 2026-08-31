import { ApiProperty } from '@nestjs/swagger';
import { TimelineEventEntity } from './timeline-event.entity';

export class TimelineSectionEntity {
  @ApiProperty({ type: TimelineEventEntity, isArray: true })
  events!: TimelineEventEntity[];
}
