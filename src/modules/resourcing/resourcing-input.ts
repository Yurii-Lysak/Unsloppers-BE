import { BadRequestException } from '@nestjs/common';

const MAX_VACANCY_DETAILS_LENGTH = 5000;
const MAX_SHORT_TEXT_LENGTH = 200;
const MIN_HEADCOUNT = 1;
const MAX_HEADCOUNT = 99;
const MAX_PROJECT_ID_LENGTH = 128;

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

function normalizeOptionalProjectId(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > MAX_PROJECT_ID_LENGTH) {
    throw new BadRequestException(
      `projectId must be at most ${MAX_PROJECT_ID_LENGTH} characters`,
    );
  }
  return trimmed;
}

function normalizeHeadcount(value: number | undefined): number {
  const headcount = value ?? MIN_HEADCOUNT;
  if (
    !Number.isInteger(headcount) ||
    headcount < MIN_HEADCOUNT ||
    headcount > MAX_HEADCOUNT
  ) {
    throw new BadRequestException(
      `headcount must be an integer between ${MIN_HEADCOUNT} and ${MAX_HEADCOUNT}`,
    );
  }
  return headcount;
}

export interface CreateResourcingRequestFieldsInput {
  vacancyDetails: string;
  expectedCompBand: string;
  duration: string;
  workload: string;
  headcount?: number;
  department: string;
  projectId?: string | null;
}

export interface NormalizedCreateResourcingRequestFields {
  vacancyDetails: string;
  expectedCompBand: string;
  duration: string;
  workload: string;
  headcount: number;
  department: string;
  projectId: string | null;
}

export function normalizeCreateResourcingRequestFields(
  input: CreateResourcingRequestFieldsInput,
): NormalizedCreateResourcingRequestFields {
  return {
    vacancyDetails: normalizeRequiredText(
      input.vacancyDetails,
      'vacancyDetails',
      MAX_VACANCY_DETAILS_LENGTH,
    ),
    expectedCompBand: normalizeRequiredText(
      input.expectedCompBand,
      'expectedCompBand',
      MAX_SHORT_TEXT_LENGTH,
    ),
    duration: normalizeRequiredText(
      input.duration,
      'duration',
      MAX_SHORT_TEXT_LENGTH,
    ),
    workload: normalizeRequiredText(
      input.workload,
      'workload',
      MAX_SHORT_TEXT_LENGTH,
    ),
    headcount: normalizeHeadcount(input.headcount),
    department: normalizeRequiredText(
      input.department,
      'department',
      MAX_SHORT_TEXT_LENGTH,
    ),
    projectId: normalizeOptionalProjectId(input.projectId),
  };
}
