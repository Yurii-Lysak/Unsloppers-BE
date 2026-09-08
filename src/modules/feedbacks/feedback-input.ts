import { BadRequestException } from '@nestjs/common';
import { Clock } from '../../clock/clock.service';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function formatFeedbackCalendarDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function utcCalendarDateMs(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function isValidFeedbackCalendarDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && formatFeedbackCalendarDate(date) === value
  );
}

export function parseFeedbackRecordedAt(value: string, clock: Clock): Date {
  if (!isValidFeedbackCalendarDate(value)) {
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
