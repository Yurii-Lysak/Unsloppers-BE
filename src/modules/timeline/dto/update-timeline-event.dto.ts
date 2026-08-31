import { PartialType } from '@nestjs/swagger';
import { CreateTimelineEventDto } from './create-timeline-event.dto';

export class UpdateTimelineEventDto extends PartialType(
  CreateTimelineEventDto,
) {}
