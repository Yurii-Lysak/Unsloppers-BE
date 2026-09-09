import { Injectable } from '@nestjs/common';
import { DashboardSummaryProvider } from '../contracts/dashboard-summary-provider.contract';
import type { DashboardSummaryScope } from '../contracts/dashboard-summary.types';
import { RegisterProvider } from '../registry/register-provider.decorator';
import { filterResourcingRequestsByProject } from './resourcing-dashboard-scope.util';
import { ResourcingService } from './resourcing.service';

const BLOCK_STATUSES = new Set(['open', 'pending_dm_review']);

@Injectable()
@RegisterProvider('dashboard-summary', 'resourcing-requests')
export class ResourcingRequestsDashboardSummaryProvider extends DashboardSummaryProvider {
  constructor(private readonly resourcing: ResourcingService) {
    super();
  }

  async getSummary(viewerEmployeeId: string, scope?: DashboardSummaryScope) {
    if (scope?.variant !== 'dm') {
      return { providerId: 'resourcing-requests', status: 'unavailable' as const };
    }

    try {
      const requests = await this.resourcing.listRequests(viewerEmployeeId);
      const filtered = filterResourcingRequestsByProject(
        requests.filter((request) => BLOCK_STATUSES.has(request.status)),
        scope.projectId,
      ).sort(
        (left, right) =>
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
      );

      return {
        providerId: 'resourcing-requests' as const,
        status: 'available' as const,
        requests: filtered.map((request) => ({
          id: request.id,
          vacancyDetails: request.vacancyDetails,
          status: request.status,
          projectId: request.projectId,
          authorDisplayName: request.author.displayName,
          createdAt: request.createdAt,
        })),
      };
    } catch {
      return { providerId: 'resourcing-requests', status: 'unavailable' as const };
    }
  }
}
