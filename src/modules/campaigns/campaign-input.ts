import { BadRequestException } from '@nestjs/common';

/**
 * Story 10.1 — local validation/normalization helpers for `FormCampaign`
 * fields. Deliberately not shared with `action-items/action-item-input.ts`
 * (Code Map: "define local campaigns equivalents, do not import cross-module")
 * even though the shape is similar — campaign fields are all required, where
 * action-items' equivalents are optional.
 */

export const CAMPAIGN_ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_PURPOSE_LENGTH = 2000;
const MAX_LINK_LENGTH = 2048;

export function formatCampaignDueDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function isValidCampaignDueDate(value: string): boolean {
  if (!CAMPAIGN_ISO_DATE_PATTERN.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && formatCampaignDueDate(date) === value;
}

export function parseCampaignDueDate(value: string): Date {
  if (!isValidCampaignDueDate(value)) {
    throw new BadRequestException(
      'dueDate must be a valid ISO calendar date (YYYY-MM-DD)',
    );
  }
  return new Date(`${value}T00:00:00.000Z`);
}

function normalizeRequiredText(
  value: string,
  fieldName: string,
  maxLength: number,
): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    throw new BadRequestException(`${fieldName} must not be empty`);
  }
  if (trimmed.length > maxLength) {
    throw new BadRequestException(
      `${fieldName} must be at most ${maxLength} characters`,
    );
  }
  return trimmed;
}

function normalizeTitle(value: string): string {
  return normalizeRequiredText(value, 'title', MAX_TITLE_LENGTH);
}

function normalizeDescription(value: string): string {
  return normalizeRequiredText(value, 'description', MAX_DESCRIPTION_LENGTH);
}

function normalizePurpose(value: string): string {
  return normalizeRequiredText(value, 'purpose', MAX_PURPOSE_LENGTH);
}

/** Only these two are ever legitimate for a link opened in a browser. */
const ALLOWED_LINK_PROTOCOLS = new Set(['http:', 'https:']);

function normalizeLink(value: string): string {
  const trimmed = normalizeRequiredText(value, 'link', MAX_LINK_LENGTH);
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new BadRequestException('link must be a valid URL');
  }
  if (!ALLOWED_LINK_PROTOCOLS.has(parsed.protocol)) {
    throw new BadRequestException('link must use http or https');
  }
  return trimmed;
}

function normalizeDueDate(value: string): Date {
  return parseCampaignDueDate(value);
}

export interface CampaignFieldsInput {
  title: string;
  description: string;
  purpose: string;
  link: string;
  dueDate: string;
}

export interface NormalizedCampaignFields {
  title: string;
  description: string;
  purpose: string;
  link: string;
  dueDate: Date;
}

/** Create path — all five fields are required (spec-10-1 Boundaries & Constraints). */
export function normalizeCampaignFields(
  input: CampaignFieldsInput,
): NormalizedCampaignFields {
  return {
    title: normalizeTitle(input.title),
    description: normalizeDescription(input.description),
    purpose: normalizePurpose(input.purpose),
    link: normalizeLink(input.link),
    dueDate: normalizeDueDate(input.dueDate),
  };
}

/** Patch path — only the fields present in the partial payload are normalized. */
export function normalizePartialCampaignFields(
  input: Partial<CampaignFieldsInput>,
): Partial<NormalizedCampaignFields> {
  const result: Partial<NormalizedCampaignFields> = {};
  if (input.title !== undefined) {
    result.title = normalizeTitle(input.title);
  }
  if (input.description !== undefined) {
    result.description = normalizeDescription(input.description);
  }
  if (input.purpose !== undefined) {
    result.purpose = normalizePurpose(input.purpose);
  }
  if (input.link !== undefined) {
    result.link = normalizeLink(input.link);
  }
  if (input.dueDate !== undefined) {
    result.dueDate = normalizeDueDate(input.dueDate);
  }
  return result;
}
