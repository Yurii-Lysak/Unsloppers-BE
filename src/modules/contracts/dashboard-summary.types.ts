export interface DashboardSummaryScope {
  subjectIds: string[];
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
