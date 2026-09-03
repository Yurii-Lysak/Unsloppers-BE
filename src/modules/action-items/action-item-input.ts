import { BadRequestException } from '@nestjs/common';

export const ACTION_ITEM_ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_LINK_LENGTH = 2048;

export function formatActionItemDueDate(value: Date): string {
  return value.toISOString().slice(0, 10);
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
