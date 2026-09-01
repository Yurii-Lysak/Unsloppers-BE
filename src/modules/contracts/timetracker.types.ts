/**
 * Typed shapes mirroring `docs/api-external-openapi.json` (TimeTracker
 * External API). Lives in `contracts` so `integrations` and other feature
 * modules can type TimeTracker payloads without cross-module imports (AD-1).
 */

export enum TaskDurationStatus {
  Open = 0,
  Submitted = 1,
  Accepted = 2,
}

export enum DayStatus {
  Vacation = 0,
  UnpaidLeave = 1,
  Sick = 2,
  OneDaySick = 3,
  WorkingDay = 4,
  Holiday = 5,
  Weekend = 6,
  RemoteWorkingDay = 7,
  WorkingHolidayWeekend = 17,
  RemoteWorkingHolidayWeekend = 18,
  CompensatedDayOff = 92,
  AdditionalWorkingDay = 93,
  VacationBlockedDay = 99,
}

export enum DayApprovalState {
  NoApprovalNeeded = 0,
  PendingApproval = 1,
  Approved = 2,
}

export enum ProjectStatus {
  Draft = 1,
  Active = 2,
  Support = 3,
  Closed = 4,
}

export enum ProjectType {
  AllTypes = 0,
  Billable = 1,
  Unbillable = 2,
  Various = 3,
  FixedPrice = 4,
  Company = 5,
}

export interface WorkingDay {
  date: string;
  companyId?: string | null;
  projectId: number;
  projectUniqueName: string;
  project: string;
  hours: number;
  hoursForCustomer: number;
  overtime: number;
  overtimeRate: number;
  outOfScope: number;
  reportState?: TaskDurationStatus | null;
  dayStatus: DayStatus;
  dayApprovalState?: DayApprovalState | null;
}

/** TimeTracker's `Employee` shape — the authoritative identity record (spec Approach). */
export interface TimetrackerEmployee {
  id: number;
  email: string;
  name: string;
  hash: string;
  countryCode: string;
  totalHours?: number | null;
  days: WorkingDay[];
}

export interface AccountingReportRequest {
  month: number;
  year: number;
  reportStates?: TaskDurationStatus[] | null;
  employeeIds?: number[] | null;
  dayStatuses?: DayStatus[] | null;
  dayApprovalStates?: DayApprovalState[] | null;
}

export interface AccountingReportResponse {
  startDate: string;
  endDate: string;
  employees: TimetrackerEmployee[];
  dayStatuses: Record<string, string>;
  reportStates: Record<string, string>;
  dayApprovalStates: Record<string, string>;
}

export interface ProjectTalentEnumDto {
  value: number;
  name: string;
}

export interface AccountTalentDto {
  email: string;
  dateStart: string;
  dateEnd?: string | null;
}

export interface ProjectTalentDto {
  id: number;
  name: string;
  description: string;
  startDate: string;
  endDate?: string | null;
  status: ProjectStatus;
  type: ProjectType;
  projectManager: string;
  deliveryManager: string;
  members: AccountTalentDto[];
  isBillable?: boolean | null;
}

export interface GetTalentProjectsResponse {
  projects: ProjectTalentDto[];
  statuses: ProjectTalentEnumDto[];
  types: ProjectTalentEnumDto[];
}
