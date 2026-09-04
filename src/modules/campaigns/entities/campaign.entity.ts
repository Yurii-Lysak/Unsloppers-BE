import { ApiProperty } from '@nestjs/swagger';

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
}
