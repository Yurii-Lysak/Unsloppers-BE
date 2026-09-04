import { BadRequestException } from '@nestjs/common';
import { Clock } from '../../clock/clock.service';
import type { RiskLevel } from '../../generated/prisma/client';

export const RISK_ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const MAX_DESCRIPTION_LENGTH = 500;
const MAX_DETAILS_LENGTH = 5000;

export const RISK_LEVELS: RiskLevel[] = [
  'low',
  'need_attention',
  'medium',
  'high',
  'leaver',
];

export function formatRiskCalendarDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** UTC calendar date as epoch ms — ignores time-of-day on the instant. */
export function utcCalendarDateMs(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function isValidRiskCalendarDate(value: string): boolean {
  if (!RISK_ISO_DATE_PATTERN.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && formatRiskCalendarDate(date) === value
  );
}

export function parseRiskRecordedAt(value: string, clock: Clock): Date {
  if (!isValidRiskCalendarDate(value)) {
    throw new BadRequestException(
      'recordedAt must be a valid ISO calendar date (YYYY-MM-DD)',
    );
  }
  const recordedAt = new Date(`${value}T00:00:00.000Z`);
  const todayMs = utcCalendarDateMs(clock.now());
  const recordedMs = utcCalendarDateMs(recordedAt);
  if (recordedMs > todayMs) {
    throw new BadRequestException('recordedAt must not be in the future');
  }
  return recordedAt;
}

export interface NormalizedRiskRecordFields {
  level: RiskLevel;
  description: string;
  details: string;
  recordedAt: Date;
}

export function normalizeRiskRecordFields(
  input: {
    level: RiskLevel;
    description: string;
    details: string;
    recordedAt: string;
  },
  clock: Clock,
): NormalizedRiskRecordFields {
  const description = input.description.trim();
  if (!description) {
    throw new BadRequestException('description must not be empty');
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new BadRequestException(
      `description must be at most ${MAX_DESCRIPTION_LENGTH} characters`,
    );
  }

  const details = input.details.trim();
  if (!details) {
    throw new BadRequestException('details must not be empty');
  }
  if (details.length > MAX_DETAILS_LENGTH) {
    throw new BadRequestException(
      `details must be at most ${MAX_DETAILS_LENGTH} characters`,
    );
  }

  return {
    level: input.level,
    description,
    details,
    recordedAt: parseRiskRecordedAt(input.recordedAt, clock),
  };
}
