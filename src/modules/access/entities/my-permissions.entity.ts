import { ApiProperty } from '@nestjs/swagger';

export class MyPermissionsEntity {
  @ApiProperty({
    type: [String],
    example: ['create_form_campaigns', 'manage_functional_roles'],
  })
  permissions!: string[];
}
