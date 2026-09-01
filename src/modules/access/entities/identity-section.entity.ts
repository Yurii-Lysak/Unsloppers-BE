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

  @ApiPropertyOptional({ type: IdentityRelationEntity, nullable: true })
  manager?: IdentityRelationEntity | null;

  @ApiPropertyOptional({ type: IdentityRelationEntity, nullable: true })
  peoplePartner?: IdentityRelationEntity | null;

  @ApiPropertyOptional({
    description:
      'Deferred until mentorship schema lands. Omitted for Colleague viewers (D5).',
    type: IdentityRelationEntity,
    nullable: true,
  })
  mentor?: IdentityRelationEntity | null;
}
