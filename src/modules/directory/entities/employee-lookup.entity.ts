import { ApiProperty } from '@nestjs/swagger';

/**
 * Story 3.4 — lightweight id+name pair for pickers (e.g. the saved-view
 * share dialog) that need every employee, not a paginated/filtered/
 * field-visibility-masked slice. Name is baseline-visible everywhere in
 * this product (S1 identity, per Story 3.6's colleague-mode rules), so no
 * access masking applies here.
 */
export class EmployeeLookupEntity {
  @ApiProperty({ format: 'uuid' })
  employeeId!: string;

  @ApiProperty({ example: 'Anton Savchenko' })
  name!: string;
}
