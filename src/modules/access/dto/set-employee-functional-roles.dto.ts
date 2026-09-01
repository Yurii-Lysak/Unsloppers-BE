import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class SetEmployeeFunctionalRolesDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    example: ['00000000-0000-4000-8000-000000000001'],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  roleIds!: string[];
}
