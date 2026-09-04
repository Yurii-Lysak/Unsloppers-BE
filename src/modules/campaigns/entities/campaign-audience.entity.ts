import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  FieldFilter,
  FieldSpec,
  FieldValue,
} from '../../contracts/field-registry.contract';

export class CampaignAudienceDefinitionEntity {
  @ApiProperty({ isArray: true })
  filters!: FieldFilter[];

  @ApiProperty({ type: String, isArray: true })
  addedEmployeeIds!: string[];

  @ApiProperty({ type: String, isArray: true })
  excludedEmployeeIds!: string[];
}

class CampaignAudienceFieldSpecEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  type!: FieldSpec['type'];

  @ApiProperty()
  source!: FieldSpec['source'];

  @ApiProperty()
  sortable!: boolean;

  @ApiProperty()
  filterable!: boolean;

  @ApiPropertyOptional()
  editable?: boolean;

  @ApiPropertyOptional()
  visibility?: FieldSpec['visibility'];

  @ApiPropertyOptional({ type: String, isArray: true })
  options?: string[];
}

class CampaignAudiencePreviewRowEntity {
  @ApiProperty()
  employeeId!: string;

  @ApiProperty({
    type: 'object',

    additionalProperties: {
      oneOf: [
        { type: 'string' },

        { type: 'number' },

        { type: 'boolean' },

        { type: 'array', items: { type: 'string' } },

        { type: 'null' },
      ],
    },
  })
  cells!: Record<string, FieldValue>;
}

export class CampaignAudiencePreviewEntity {
  @ApiProperty({ type: CampaignAudienceFieldSpecEntity, isArray: true })
  fields!: CampaignAudienceFieldSpecEntity[];

  @ApiProperty({ type: CampaignAudiencePreviewRowEntity, isArray: true })
  rows!: CampaignAudiencePreviewRowEntity[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;
}

export class CampaignAudienceResolveEntity {
  @ApiProperty({ type: String, isArray: true })
  employeeIds!: string[];
}
