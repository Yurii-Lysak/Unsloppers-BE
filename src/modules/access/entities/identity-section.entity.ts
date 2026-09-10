import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class IdentityRelationEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Jane Manager' })
  displayName!: string;
}

export class IdentitySectionDto {
  @ApiProperty({ example: 'Anton Savchenko' })
  displayName!: string;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Access-gated photo download path when a profile photo exists; null otherwise.',
    example: '/api/v1/employees/{employeeId}/identity/photo',
  })
  photoUrl?: string | null;

  @ApiPropertyOptional({ type: IdentityRelationEntity, nullable: true })
  manager?: IdentityRelationEntity | null;

  @ApiPropertyOptional({ type: IdentityRelationEntity, nullable: true })
  peoplePartner?: IdentityRelationEntity | null;

  @ApiPropertyOptional({
    description:
      'Active mentor for the subject. Omitted for audiences outside D5 (Self, ReportingLine, ProjectLine, PP).',
    type: IdentityRelationEntity,
  })
  mentor?: IdentityRelationEntity;
}
