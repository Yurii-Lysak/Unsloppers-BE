import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LeavePeriodEntity {
  @ApiPropertyOptional({
    description:
      'Leave type slug. Omitted for Colleague viewers (dates-only S10 grant).',
    enum: [
      'vacation',
      'unpaid_leave',
      'sick',
      'one_day_sick',
      'compensated_day_off',
    ],
    nullable: true,
    type: String,
  })
  type?: string | null;

  @ApiProperty({ format: 'date', example: '2026-08-25' })
  startDate!: string;

  @ApiProperty({ format: 'date', example: '2026-08-29' })
  endDate!: string;

  @ApiPropertyOptional({
    enum: ['no_approval_needed', 'pending_approval', 'approved', 'unknown'],
    nullable: true,
    type: String,
  })
  approvalState?: string | null;
}

export class LeavesSectionEntity {
  @ApiProperty({ enum: ['ok', 'unavailable'] })
  availability!: 'ok' | 'unavailable';

  @ApiProperty({ type: [LeavePeriodEntity] })
  leaves!: LeavePeriodEntity[];

  @ApiPropertyOptional({
    description:
      'Outbound link for self-service leave management in TimeTracker.',
    format: 'uri',
    nullable: true,
    type: String,
  })
  manageLeaveUrl?: string | null;
}
