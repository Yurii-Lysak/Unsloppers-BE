import {
  AccountingReportResponse,
  GetTalentProjectsResponse,
  ProjectTalentDto,
  ProjectTalentEnumDto,
  TimetrackerEmployee,
} from '../../modules/timetracker/timetracker.types';
import { PopulationSizeError, TimetrackerValidationError } from './seed.errors';

/** Ask-First floor (spec Boundaries & Constraints) — below this, halt and ask before padding. */
export const MIN_IDENTITY_COUNT = 500;
/** Ask-First ceiling — above this, halt and confirm before writing. */
export const MAX_IDENTITY_COUNT = 2000;

export interface MonthYear {
  month: number;
  year: number;
}

/**
 * The most recently *completed* calendar month relative to `now`, in UTC —
 * a single month, not a range (spec Approach). E.g. if `now` is any day in
 * August, this returns July of the same year; if `now` is in January, it
 * returns December of the previous year.
 */
export function mostRecentCompleteMonth(now: Date = new Date()): MonthYear {
  const currentYear = now.getUTCFullYear();
  const zeroIndexedCurrentMonth = now.getUTCMonth(); // 0 = January

  if (zeroIndexedCurrentMonth === 0) {
    return { month: 12, year: currentYear - 1 };
  }
  // A zero-indexed "current month" value is numerically identical to the
  // one-indexed previous month (e.g. August is index 7; July is month 7).
  return { month: zeroIndexedCurrentMonth, year: currentYear };
}

/**
 * Validates the Accounting endpoint response envelope before field-level
 * checks — a missing or non-array `employees` must fail as
 * `TimetrackerValidationError`, not a raw `TypeError`.
 */
export function validateAccountingReport(
  response: AccountingReportResponse,
): void {
  if (response == null || typeof response !== 'object') {
    throw new TimetrackerValidationError(
      'Accounting response is missing or not an object — TimeTracker OpenAPI contract violation.',
    );
  }
  if (!Array.isArray(response.employees)) {
    throw new TimetrackerValidationError(
      'Accounting response employees is missing or not an array — TimeTracker OpenAPI contract violation.',
    );
  }
}

/**
 * Validates the Talents endpoint response envelope — OpenAPI requires
 * `projects`, `statuses`, and `types` arrays on every 200 response.
 */
export function validateTalentsResponse(
  response: GetTalentProjectsResponse,
): void {
  if (response == null || typeof response !== 'object') {
    throw new TimetrackerValidationError(
      'Talents response is missing or not an object — TimeTracker OpenAPI contract violation.',
    );
  }
  if (!Array.isArray(response.projects)) {
    throw new TimetrackerValidationError(
      'Talents response projects is missing or not an array — TimeTracker OpenAPI contract violation.',
    );
  }
  if (!Array.isArray(response.statuses)) {
    throw new TimetrackerValidationError(
      'Talents response statuses is missing or not an array — TimeTracker OpenAPI contract violation.',
    );
  }
  if (!Array.isArray(response.types)) {
    throw new TimetrackerValidationError(
      'Talents response types is missing or not an array — TimeTracker OpenAPI contract violation.',
    );
  }
  validateTalentsEnumList(response.statuses, 'statuses');
  validateTalentsEnumList(response.types, 'types');
}

function validateTalentsEnumList(
  items: ProjectTalentEnumDto[],
  field: 'statuses' | 'types',
): void {
  items.forEach((item, index) => {
    if (
      item == null ||
      typeof item.value !== 'number' ||
      typeof item.name !== 'string'
    ) {
      throw new TimetrackerValidationError(
        `Talents response ${field}[${index}] is missing a required field ` +
          '(value/name) — TimeTracker OpenAPI contract violation.',
      );
    }
  });
}

/**
 * Required-field validation for the Accounting endpoint's `employees[]`
 * (OpenAPI `Employee.required`: id/email/name/hash/countryCode/days).
 * Throws on the first malformed record — treated identically to
 * TimeTracker-unreachable: no writes have happened yet.
 */
export function validateAccountingEmployees(
  employees: TimetrackerEmployee[],
): void {
  if (!Array.isArray(employees)) {
    throw new TimetrackerValidationError(
      'Accounting response employees is missing or not an array — TimeTracker OpenAPI contract violation.',
    );
  }
  employees.forEach((employee, index) => {
    if (
      employee == null ||
      typeof employee.id !== 'number' ||
      typeof employee.email !== 'string' ||
      employee.email.trim() === '' ||
      typeof employee.name !== 'string' ||
      employee.name.trim() === '' ||
      typeof employee.hash !== 'string' ||
      employee.hash.trim() === '' ||
      typeof employee.countryCode !== 'string' ||
      employee.countryCode.trim() === '' ||
      !Array.isArray(employee.days)
    ) {
      throw new TimetrackerValidationError(
        `Accounting response employees[${index}] is missing a required field ` +
          '(id/email/name/hash/countryCode/days) — TimeTracker OpenAPI contract violation.',
      );
    }
  });
}

/**
 * Required-field validation for the Talents endpoint's `projects[]`
 * (OpenAPI `ProjectTalentDto.required` and `AccountTalentDto.required`).
 */
export function validateTalentsProjects(projects: ProjectTalentDto[]): void {
  if (!Array.isArray(projects)) {
    throw new TimetrackerValidationError(
      'Talents response projects is missing or not an array — TimeTracker OpenAPI contract violation.',
    );
  }
  projects.forEach((project, index) => {
    if (
      project == null ||
      typeof project.id !== 'number' ||
      typeof project.name !== 'string' ||
      typeof project.description !== 'string' ||
      typeof project.startDate !== 'string' ||
      typeof project.status !== 'number' ||
      typeof project.type !== 'number' ||
      typeof project.projectManager !== 'string' ||
      typeof project.deliveryManager !== 'string' ||
      !Array.isArray(project.members)
    ) {
      throw new TimetrackerValidationError(
        `Talents response projects[${index}] is missing a required field ` +
          '(id/name/description/startDate/status/type/projectManager/deliveryManager/members) — ' +
          'TimeTracker OpenAPI contract violation.',
      );
    }
    project.members.forEach((member, memberIndex) => {
      if (
        member == null ||
        typeof member.email !== 'string' ||
        member.email.trim() === '' ||
        typeof member.dateStart !== 'string'
      ) {
        throw new TimetrackerValidationError(
          `Talents response projects[${index}].members[${memberIndex}] is missing a required field ` +
            '(email/dateStart) — TimeTracker OpenAPI contract violation.',
        );
      }
    });
  });
}

export interface DedupeResult {
  identities: TimetrackerEmployee[];
  duplicateEmails: string[];
}

/**
 * Case-insensitive dedupe key — TimeTracker may return the same person's
 * email with differing case across records (or across the Accounting vs.
 * Talents endpoints); email identity should not depend on casing. The
 * original-cased email value is always preserved for DB writes/comparisons
 * elsewhere — only the matching key is normalized.
 */
export function normalizeEmailKey(email: string): string {
  return email.toLowerCase();
}

/**
 * Deduplicates Accounting employees by email (case-insensitively) within a
 * single fetch — if two records share an email, the last one returned wins
 * (spec Boundaries). Order-preserving over the surviving identities.
 */
export function dedupeEmployeesByEmail(
  employees: TimetrackerEmployee[],
): DedupeResult {
  const byEmail = new Map<string, TimetrackerEmployee>();
  const duplicateEmails = new Set<string>();

  for (const employee of employees) {
    const key = normalizeEmailKey(employee.email);
    if (byEmail.has(key)) {
      duplicateEmails.add(employee.email);
    }
    byEmail.set(key, employee); // last one wins
  }

  return {
    identities: [...byEmail.values()],
    duplicateEmails: [...duplicateEmails],
  };
}

/** Ask-First halt for a population outside [MIN_IDENTITY_COUNT, MAX_IDENTITY_COUNT]. */
export function assertPopulationSize(count: number): void {
  if (count < MIN_IDENTITY_COUNT) {
    throw new PopulationSizeError(
      `TimeTracker Accounting endpoint returned ${count} unique identities, below the required floor ` +
        `of ${MIN_IDENTITY_COUNT}. Halting before any write, per spec Ask-First — confirm with the team ` +
        'whether to pad with synthetic identity-anchor people rather than silently inventing extra ' +
        '"real-looking" employees.',
    );
  }
  if (count > MAX_IDENTITY_COUNT) {
    throw new PopulationSizeError(
      `TimeTracker Accounting endpoint returned ${count} unique identities, above the ${MAX_IDENTITY_COUNT} ` +
        'ceiling. Halting before any write, per spec Ask-First — an unexpectedly large response likely ' +
        'signals a wrong filter or endpoint, not real data.',
    );
  }
}
