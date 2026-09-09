import { BadRequestException } from '@nestjs/common';
import { isValidIdpDeadline } from './idp-record-input';

export function parseCdsAssessmentDate(value: string): Date {
  if (!isValidIdpDeadline(value)) {
    throw new BadRequestException(
      'date must be a valid ISO calendar date (YYYY-MM-DD)',
    );
  }
  return new Date(`${value}T00:00:00.000Z`);
}
