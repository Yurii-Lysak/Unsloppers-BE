import { BadRequestException } from '@nestjs/common';
import { Clock } from '../../clock/clock.service';
import type { ActionItemStatus } from '../contracts/action-item-creation.contract';

export const ACTION_ITEM_ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_LINK_LENGTH = 2048;

export function formatActionItemDueDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** UTC calendar date as epoch ms — ignores time-of-day on the instant. */
export function utcCalendarDateMs(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Derived overdue flag: open items only, due date strictly before today (UTC).
 * Never stored — recomputed on every read via {@link Clock}.
 */
export function isActionItemOverdue(
  status: ActionItemStatus,
  dueDate: Date,
  clock: Clock,
): boolean {
  if (status !== 'open') {
    return false;
  }
  const todayMs = utcCalendarDateMs(clock.now());
  const dueMs = utcCalendarDateMs(dueDate);
  return dueMs < todayMs;
}

export function isValidActionItemDueDate(value: string): boolean {
  if (!ACTION_ITEM_ISO_DATE_PATTERN.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && formatActionItemDueDate(date) === value
  );
}

export function parseActionItemDueDate(value: string): Date {
  if (!isValidActionItemDueDate(value)) {
    throw new BadRequestException(
      'dueDate must be a valid ISO calendar date (YYYY-MM-DD)',
    );
  }
  return new Date(`${value}T00:00:00.000Z`);
}

export interface NormalizedActionItemFields {
  title: string;
  description: string | null;
  dueDate: Date;
  link: string | null;
}

export function normalizeActionItemFields(input: {
  title: string;
  description?: string;
  dueDate: string;
  link?: string;
}): NormalizedActionItemFields {
  const title = input.title.trim();
  if (!title) {
    throw new BadRequestException('title must not be empty');
  }
  if (title.length > MAX_TITLE_LENGTH) {
    throw new BadRequestException(
      `title must be at most ${MAX_TITLE_LENGTH} characters`,
    );
  }

  const description = input.description?.trim();
  if (description && description.length > MAX_DESCRIPTION_LENGTH) {
    throw new BadRequestException(
      `description must be at most ${MAX_DESCRIPTION_LENGTH} characters`,
    );
  }

  let link = input.link?.trim();
  if (link === '') {
    link = undefined;
  }
  if (link && link.length > MAX_LINK_LENGTH) {
    throw new BadRequestException(
      `link must be at most ${MAX_LINK_LENGTH} characters`,
    );
  }
  if (link) {
    try {
      const parsed = new URL(link);
      if (!parsed.protocol) {
        throw new Error('missing protocol');
      }
    } catch {
      throw new BadRequestException('link must be a valid URL');
    }
  }

  return {
    title,
    description: description || null,
    dueDate: parseActionItemDueDate(input.dueDate),
    link: link ?? null,
  };
}
