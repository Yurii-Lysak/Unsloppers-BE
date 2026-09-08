import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CampaignAudienceDefinitionEntity } from './campaign-audience.entity';

export class CampaignCreatorEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  displayName!: string;
}

export class CampaignReadEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  purpose!: string;

  @ApiProperty()
  link!: string;

  @ApiProperty({ format: 'date' })
  dueDate!: string;

  @ApiProperty({ enum: ['draft', 'active'] })
  status!: 'draft' | 'active';

  @ApiProperty({ type: CampaignCreatorEntity })
  creator!: CampaignCreatorEntity;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({ type: CampaignAudienceDefinitionEntity })
  audience!: CampaignAudienceDefinitionEntity;
}

export class CampaignCompletionAssigneeEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  displayName!: string;
}

export class CampaignCompletionRowEntity {
  @ApiProperty()
  actionItemId!: string;

  @ApiProperty({ type: CampaignCompletionAssigneeEntity })
  assignee!: CampaignCompletionAssigneeEntity;

  @ApiProperty({ enum: ['open', 'completed', 'cancelled'] })
  status!: 'open' | 'completed' | 'cancelled';

  @ApiProperty({ format: 'date' })
  dueDate!: string;

  @ApiProperty()
  isOverdue!: boolean;

  @ApiPropertyOptional({ format: 'date-time' })
  completedAt?: string;
}

export class CampaignCompletionEntity {
  @ApiProperty({ type: [CampaignCompletionRowEntity] })
  recipients!: CampaignCompletionRowEntity[];
}
