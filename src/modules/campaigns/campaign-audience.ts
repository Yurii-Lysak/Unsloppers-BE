import { BadRequestException } from '@nestjs/common';
import type { FieldFilter } from '../contracts/field-registry.contract';
import type { CampaignAudienceFilterDto } from './dto/campaign-audience-filter.dto';

export interface CampaignAudienceDefinition {
  filters: FieldFilter[];
  addedEmployeeIds: string[];
  excludedEmployeeIds: string[];
}

export interface CampaignAudienceValidationError {
  invalidEmployeeIds?: string[];
  invalidExcludedEmployeeIds?: string[];
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const parseStoredAudienceFilters = (value: unknown): FieldFilter[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value as FieldFilter[];
};

export const normalizeAudienceDefinition = (
  input: CampaignAudienceDefinition,
): CampaignAudienceDefinition => {
  const excluded = uniqueIds(input.excludedEmployeeIds);
  const excludedSet = new Set(excluded);
  const added = uniqueIds(input.addedEmployeeIds).filter(
    (id) => !excludedSet.has(id),
  );

  return {
    filters: input.filters,
    addedEmployeeIds: added,
    excludedEmployeeIds: excluded,
  };
};

export const assertNoDuplicateIds = (
  ids: string[],
  field: 'addedEmployeeIds' | 'excludedEmployeeIds',
): void => {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) {
      duplicates.push(id);
      continue;
    }
    seen.add(id);
  }
  if (duplicates.length > 0) {
    throw new BadRequestException({
      message: `Duplicate ids in ${field}`,
      ...(field === 'addedEmployeeIds'
        ? { invalidEmployeeIds: duplicates }
        : { invalidExcludedEmployeeIds: duplicates }),
    });
  }
};

export const assertValidUuidIds = (ids: string[]): void => {
  for (const id of ids) {
    if (!UUID_PATTERN.test(id)) {
      throw new BadRequestException({
        message: 'Invalid employee id',
        invalidEmployeeIds: [id],
      });
    }
  }
};

export const resolveAudienceIds = (
  filterMatchIds: string[],
  definition: CampaignAudienceDefinition,
): string[] => {
  const excluded = new Set(definition.excludedEmployeeIds);
  const fromFilters = filterMatchIds.filter((id) => !excluded.has(id));
  const resolved = new Set(fromFilters);
  for (const id of definition.addedEmployeeIds) {
    resolved.add(id);
  }
  return [...resolved];
};

export const toFieldFilters = (
  filters: CampaignAudienceFilterDto[],
): FieldFilter[] =>
  filters.map((filter) => ({
    fieldId: filter.fieldId,
    operator: filter.operator,
    value: filter.value,
  }));

const uniqueIds = (ids: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
};
