import { ApiProperty } from '@nestjs/swagger';

export class EmployeeSummaryEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Anton Savchenko' })
  displayName!: string;
}
