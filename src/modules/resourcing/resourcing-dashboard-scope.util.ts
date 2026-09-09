import { DASHBOARD_UNASSIGNED_PROJECT_ID } from '../contracts/dashboard-summary.types';

export interface ResourcingRequestProjectRef {
  projectId?: string | null;
}

export function filterResourcingRequestsByProject<
  T extends ResourcingRequestProjectRef,
>(requests: T[], projectId?: string): T[] {
  if (!projectId || projectId === 'all') {
    return requests;
  }

  if (projectId === DASHBOARD_UNASSIGNED_PROJECT_ID) {
    return requests.filter((request) => request.projectId == null);
  }

  return requests.filter((request) => request.projectId === projectId);
}
