import { ApiProperty } from '@nestjs/swagger';

export class PermissionCatalogEntryEntity {
  @ApiProperty({ example: 'create_form_campaigns' })
  key!: string;

  @ApiProperty({ example: 'Create form campaigns' })
  label!: string;

  @ApiProperty({ required: false })
  description?: string;
}
