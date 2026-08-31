import { ApiProperty } from '@nestjs/swagger';

export class FunctionalRoleEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Security Champion' })
  name!: string;

  @ApiProperty()
  isBuiltIn!: boolean;

  @ApiProperty({ type: [String], example: ['create_form_campaigns'] })
  permissionKeys!: string[];
}
