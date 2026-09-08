import type {
  DashboardSummaryFragment,
  DashboardSummaryScope,
} from './dashboard-summary.types';

/**
 * AD-3 dashboard-summary provider — one implementation per aggregate source
 * (risk counts, leave status, resourcing counts, etc.), discovered via
 * `@RegisterProvider('dashboard-summary', id)`.
 */
export abstract class DashboardSummaryProvider {
  abstract getSummary(
    viewerEmployeeId: string,
    scope?: DashboardSummaryScope,
  ): Promise<DashboardSummaryFragment>;
}
