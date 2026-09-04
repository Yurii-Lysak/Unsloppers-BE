import { IsIn, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type {
  FieldValue,
  FilterOperator,
} from '../../contracts/field-registry.contract';

const FILTER_OPERATORS: FilterOperator[] = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'in',
];

export class CampaignAudienceFilterDto {
  @ApiProperty()
  @IsString()
  fieldId!: string;

  @ApiProperty({ enum: FILTER_OPERATORS })
  @IsIn(FILTER_OPERATORS)
  operator!: FilterOperator;

  @ApiProperty({
    oneOf: [
      { type: 'string' },
      { type: 'number' },
      { type: 'boolean' },
      { type: 'array', items: { type: 'string' } },
      { type: 'null' },
    ],
  })
  value!: FieldValue | string[];
}
