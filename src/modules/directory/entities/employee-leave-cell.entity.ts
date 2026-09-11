import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Response shape for `GET /employees/leaves` (Story 3.6 list-performance
 * follow-up). Mirrors `EmployeeListLeaveCell` from the `employee-list-leaves`
 * contract so it has a concrete Swagger type.
 */
export class EmployeeLeaveCellEntity {
  @ApiProperty({ example: '2026-08-25 – 2026-08-29' })
  value!: string;

  @ApiProperty()
  unavailable!: boolean;

  @ApiPropertyOptional({
    description: 'True when serving last-known data after a sync failure.',
  })
  stale?: boolean;
}
