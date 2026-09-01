import { Injectable } from '@nestjs/common';
import { ExternalIdentityMapping } from '../contracts/external-identity-mapping.contract';
import {
  ProjectStatus,
  ProjectTalentDto,
  ProjectType,
  TimetrackerEmployee,
} from '../contracts/timetracker.types';

export interface NormalizedProjectAssignment {
  sourceKey: string;
  employeeId: string;
  projectId: string;
  pmId: string;
  dmId: string;
  startDate: Date;
  endDate: Date | null;
}

export interface ProjectAssignmentOmissionCounts {
  directoryMisses: number;
  identityMisses: number;
  /** Exact duplicate feed rows ignored after their normalized values match. */
  duplicateAssignments: number;
  /** Candidates omitted only because directory or C5 resolution failed. */
  omittedAssignments: number;
}

export interface ProjectAssignmentMappingResult {
  assignments: NormalizedProjectAssignment[];
  omissions: ProjectAssignmentOmissionCounts;
}

/** Sanitized boundary error: intentionally carries no payload values or PII. */
export class TimetrackerProjectsPayloadError extends Error {
  constructor() {
    super('Invalid TimeTracker projects payload');
    this.name = 'TimetrackerProjectsPayloadError';
  }
}

@Injectable()
export class ProjectAssignmentMapper {
  constructor(private readonly identityMapping: ExternalIdentityMapping) {}

  async map(
    projects: ProjectTalentDto[],
    directory: TimetrackerEmployee[],
  ): Promise<ProjectAssignmentMappingResult> {
    validatePayload(projects, directory);
    const directoryByEmail = buildDirectory(directory);
    const identityCache = new Map<string, Promise<string | null>>();
    const assignments = new Map<string, NormalizedProjectAssignment>();
    const omissions: ProjectAssignmentOmissionCounts = {
      directoryMisses: 0,
      identityMisses: 0,
      duplicateAssignments: 0,
      omittedAssignments: 0,
    };

    const resolveEmployee = async (email: string): Promise<string | null> => {
      const externalId = directoryByEmail.get(normalizeEmail(email));
      if (externalId === undefined) {
        omissions.directoryMisses += 1;
        return null;
      }

      let pending = identityCache.get(externalId);
      if (!pending) {
        pending = this.identityMapping
          .findByExternalId('timetracker', externalId)
          .then((mapping) => mapping?.employeeId ?? null);
        identityCache.set(externalId, pending);
      }

      const employeeId = await pending;
      if (!employeeId) {
        omissions.identityMisses += 1;
      }
      return employeeId;
    };

    for (const project of projects) {
      const [pmId, dmId] = await Promise.all([
        resolveEmployee(project.projectManager),
        resolveEmployee(project.deliveryManager),
      ]);
      if (!pmId || !dmId) {
        omissions.omittedAssignments += project.members.length;
        continue;
      }

      for (const member of project.members) {
        const externalId = directoryByEmail.get(normalizeEmail(member.email));
        if (externalId === undefined) {
          omissions.directoryMisses += 1;
          omissions.omittedAssignments += 1;
          continue;
        }

        const employeeId = await resolveEmployee(member.email);
        if (!employeeId) {
          omissions.omittedAssignments += 1;
          continue;
        }

        const startDate = parseUtcDate(member.dateStart);
        const endDate =
          member.dateEnd === null || member.dateEnd === undefined
            ? null
            : parseUtcDate(member.dateEnd);
        if (!startDate || (member.dateEnd && !endDate)) {
          throw new TimetrackerProjectsPayloadError();
        }

        const sourceKey = `timetracker:${project.id}:${externalId}`;
        const candidate: NormalizedProjectAssignment = {
          sourceKey,
          employeeId,
          projectId: String(project.id),
          pmId,
          dmId,
          startDate,
          endDate,
        };
        const existing = assignments.get(sourceKey);
        if (existing) {
          if (!sameAssignment(existing, candidate)) {
            throw new TimetrackerProjectsPayloadError();
          }
          omissions.duplicateAssignments += 1;
          continue;
        }

        assignments.set(sourceKey, candidate);
      }
    }

    return { assignments: [...assignments.values()], omissions };
  }
}

function buildDirectory(
  employees: TimetrackerEmployee[],
): ReadonlyMap<string, string> {
  const directory = new Map<string, string>();
  const ambiguous = new Set<string>();

  for (const employee of employees) {
    const email = normalizeEmail(employee.email);
    if (ambiguous.has(email)) {
      continue;
    }
    const externalId = String(employee.id);
    const existing = directory.get(email);
    if (existing === externalId) {
      continue;
    }
    if (existing !== undefined) {
      directory.delete(email);
      ambiguous.add(email);
      continue;
    }
    directory.set(email, externalId);
  }

  return directory;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function parseUtcDate(value: string): Date | null {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!match || Number.isNaN(Date.parse(value))) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function validatePayload(
  projects: ProjectTalentDto[],
  directory: TimetrackerEmployee[],
): void {
  if (!Array.isArray(projects) || !Array.isArray(directory)) {
    throw new TimetrackerProjectsPayloadError();
  }
  for (const employee of directory as unknown[]) {
    validateDirectoryEmployee(employee);
  }
  for (const project of projects as unknown[]) {
    validateProject(project);
  }
}

function validateDirectoryEmployee(value: unknown): void {
  if (!isRecord(value)) {
    throw new TimetrackerProjectsPayloadError();
  }
  assertPositiveSafeInteger(value.id);
  assertEmail(value.email);
  assertString(value.name);
  assertString(value.hash);
  assertString(value.countryCode);
  if (!Array.isArray(value.days)) {
    throw new TimetrackerProjectsPayloadError();
  }
  if (
    value.totalHours !== undefined &&
    value.totalHours !== null &&
    (typeof value.totalHours !== 'number' || !Number.isFinite(value.totalHours))
  ) {
    throw new TimetrackerProjectsPayloadError();
  }
}

function validateProject(value: unknown): void {
  if (!isRecord(value)) {
    throw new TimetrackerProjectsPayloadError();
  }
  assertPositiveSafeInteger(value.id);
  assertString(value.name);
  assertString(value.description);
  const projectStart = assertDateTime(value.startDate);
  const projectEnd =
    value.endDate === undefined || value.endDate === null
      ? null
      : assertDateTime(value.endDate);
  if (projectEnd && projectEnd < projectStart) {
    throw new TimetrackerProjectsPayloadError();
  }
  if (
    value.status !== ProjectStatus.Active &&
    value.status !== ProjectStatus.Support
  ) {
    throw new TimetrackerProjectsPayloadError();
  }
  if (
    value.type !== ProjectType.AllTypes &&
    value.type !== ProjectType.Billable &&
    value.type !== ProjectType.Unbillable &&
    value.type !== ProjectType.Various &&
    value.type !== ProjectType.FixedPrice &&
    value.type !== ProjectType.Company
  ) {
    throw new TimetrackerProjectsPayloadError();
  }
  assertEmail(value.projectManager);
  assertEmail(value.deliveryManager);
  if (!Array.isArray(value.members)) {
    throw new TimetrackerProjectsPayloadError();
  }
  if (
    value.isBillable !== undefined &&
    value.isBillable !== null &&
    typeof value.isBillable !== 'boolean'
  ) {
    throw new TimetrackerProjectsPayloadError();
  }
  for (const member of value.members) {
    validateMember(member);
  }
}

function validateMember(value: unknown): void {
  if (!isRecord(value)) {
    throw new TimetrackerProjectsPayloadError();
  }
  assertEmail(value.email);
  const startDate = assertDateTime(value.dateStart);
  const endDate =
    value.dateEnd === undefined || value.dateEnd === null
      ? null
      : assertDateTime(value.dateEnd);
  if (endDate && endDate < startDate) {
    throw new TimetrackerProjectsPayloadError();
  }
}

function assertDateTime(value: unknown): Date {
  if (typeof value !== 'string') {
    throw new TimetrackerProjectsPayloadError();
  }
  const parsed = parseUtcDate(value);
  if (!parsed) {
    throw new TimetrackerProjectsPayloadError();
  }
  return parsed;
}

function assertEmail(value: unknown): void {
  if (
    typeof value !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value))
  ) {
    throw new TimetrackerProjectsPayloadError();
  }
}

function assertPositiveSafeInteger(value: unknown): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new TimetrackerProjectsPayloadError();
  }
}

function assertString(value: unknown): void {
  if (typeof value !== 'string') {
    throw new TimetrackerProjectsPayloadError();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameAssignment(
  left: NormalizedProjectAssignment,
  right: NormalizedProjectAssignment,
): boolean {
  return (
    left.sourceKey === right.sourceKey &&
    left.employeeId === right.employeeId &&
    left.projectId === right.projectId &&
    left.pmId === right.pmId &&
    left.dmId === right.dmId &&
    left.startDate.getTime() === right.startDate.getTime() &&
    (left.endDate?.getTime() ?? null) === (right.endDate?.getTime() ?? null)
  );
}
