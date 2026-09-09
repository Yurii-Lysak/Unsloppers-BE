import { BadRequestException } from '@nestjs/common';

export const IDP_ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_FILE_URL_LENGTH = 2048;

export function isValidIdpDeadline(value: string): boolean {
  if (!IDP_ISO_DATE_PATTERN.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && formatIdpCalendarDate(date) === value;
}

export function formatIdpCalendarDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function parseIdpDeadline(value: string): Date {
  if (!isValidIdpDeadline(value)) {
    throw new BadRequestException(
      'deadline must be a valid ISO calendar date (YYYY-MM-DD)',
    );
  }
  return new Date(`${value}T00:00:00.000Z`);
}

export interface NormalizedIdpRecordFields {
  description: string;
  deadline: Date;
  fileUrl: string;
}

export function normalizeCreateIdpRecordFields(dto: {
  description: string;
  deadline: string;
  fileUrl: string;
}): NormalizedIdpRecordFields {
  const description = dto.description.trim();
  if (!description) {
    throw new BadRequestException('description must not be empty');
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new BadRequestException(
      `description must be at most ${MAX_DESCRIPTION_LENGTH} characters`,
    );
  }

  const fileUrl = dto.fileUrl.trim();
  if (!fileUrl) {
    throw new BadRequestException('fileUrl must not be empty');
  }
  if (fileUrl.length > MAX_FILE_URL_LENGTH) {
    throw new BadRequestException(
      `fileUrl must be at most ${MAX_FILE_URL_LENGTH} characters`,
    );
  }

  return {
    description,
    deadline: parseIdpDeadline(dto.deadline),
    fileUrl,
  };
}

export function normalizeUpdateIdpRecordFields(
  dto: Partial<{
    description: string;
    deadline: string;
    fileUrl: string;
  }>,
): Partial<NormalizedIdpRecordFields> {
  const normalized: Partial<NormalizedIdpRecordFields> = {};

  if (dto.description !== undefined) {
    const description = dto.description.trim();
    if (!description) {
      throw new BadRequestException('description must not be empty');
    }
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      throw new BadRequestException(
        `description must be at most ${MAX_DESCRIPTION_LENGTH} characters`,
      );
    }
    normalized.description = description;
  }

  if (dto.deadline !== undefined) {
    normalized.deadline = parseIdpDeadline(dto.deadline);
  }

  if (dto.fileUrl !== undefined) {
    const fileUrl = dto.fileUrl.trim();
    if (!fileUrl) {
      throw new BadRequestException('fileUrl must not be empty');
    }
    if (fileUrl.length > MAX_FILE_URL_LENGTH) {
      throw new BadRequestException(
        `fileUrl must be at most ${MAX_FILE_URL_LENGTH} characters`,
      );
    }
    normalized.fileUrl = fileUrl;
  }

  return normalized;
}
