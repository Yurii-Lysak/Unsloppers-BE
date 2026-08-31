import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

export class SetCustomFieldValueDto {
  @ApiPropertyOptional({
    description:
      'Typed value matching the field definition, or null to clear (lazy unset)',
    oneOf: [
      { type: 'string' },
      { type: 'number' },
      { type: 'boolean' },
      { type: 'array', items: { type: 'string' } },
    ],
    nullable: true,
  })
  @IsOptional()
  value?: string | number | boolean | string[] | null;
}
