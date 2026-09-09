export type DashboardSummaryVariant = 'um' | 'dm' | 'pm' | 'pp';

export const DASHBOARD_UNASSIGNED_PROJECT_ID = 'unassigned';

export interface DashboardSummaryScope {
  subjectIds: string[];
  projectId?: string;
  variant?: DashboardSummaryVariant;
}

export type DashboardRiskLevel =
  'low' | 'need_attention' | 'medium' | 'high' | 'leaver';

export interface DashboardRiskRowFragment {
  employeeId: string;
  displayName: string;
  currentLevel: DashboardRiskLevel;
  trend?: 'up' | 'down' | 'flat';
  recordedAt: string;
}

export interface DashboardRiskCountsFragment {
  need_attention: number;
  medium: number;
  high: number;
  leaver: number;
  totalActive: number;
}

export interface DashboardResourcingRequestRowFragment {
  id: string;
  vacancyDetails: string;
  status: 'open' | 'pending_dm_review';
  projectId?: string | null;
  authorDisplayName: string;
  createdAt: string;
}

export interface DashboardTableCellFragment {
  value: string;
  unavailable: boolean;
  stale?: boolean;
}

export type DashboardSummaryFragment =
  | {
      providerId: 'risks';
      status: 'available';
      counts: DashboardRiskCountsFragment;
      rows: DashboardRiskRowFragment[];
    }
  | {
      providerId: 'action-items';
      status: 'available';
      openCount: number;
      overdueCount: number;
    }
  | {
      providerId: 'resourcing';
      status: 'available';
      openCount: number;
    }
  | {
      providerId: 'resourcing-requests';
      status: 'available';
      requests: DashboardResourcingRequestRowFragment[];
    }
  | {
      providerId: 'campaigns';
      status: 'available';
      openCount: number;
    }
  | {
      providerId: 'leave';
      status: 'available';
      cells: Record<string, DashboardTableCellFragment>;
    }
  | {
      providerId: 'employment';
      status: 'available';
      cells: Record<string, DashboardTableCellFragment>;
    }
  | {
      providerId: string;
      status: 'unavailable';
    };
