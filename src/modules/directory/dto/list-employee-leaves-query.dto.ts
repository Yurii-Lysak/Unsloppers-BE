import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MAX_PAGE_SIZE } from '../../contracts/employee-list.constants';

export class ListEmployeeLeavesQueryDto {
  @ApiProperty({
    description: 'Comma-separated employee ids to fetch leave data for.',
    example: 'a1b2c3d4-0000-0000-0000-000000000000',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((id) => id.trim())
          .filter((id) => id.length > 0)
      : value,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PAGE_SIZE)
  @IsUUID('4', { each: true })
  employeeIds!: string[];
}
