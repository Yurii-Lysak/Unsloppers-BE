import {
  AccountingReportRequest,
  AccountingReportResponse,
  GetTalentProjectsResponse,
  ProjectStatus,
} from './timetracker.types';

/**
 * HTTP client for the TimeTracker External API (`docs/api-external-openapi.json`).
 * Owner: `timetracker` module — `integrations` consumes via this token only (AD-1).
 */
export abstract class TimetrackerClient {
  abstract fetchAccountingReport(
    request: AccountingReportRequest,
  ): Promise<AccountingReportResponse>;

  abstract fetchTalentsProjects(
    statuses?: ProjectStatus[],
  ): Promise<GetTalentProjectsResponse>;
}
