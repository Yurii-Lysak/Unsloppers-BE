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

export type DashboardSummaryFragment =
  | {
      providerId: 'risks';
      status: 'available';
      counts: DashboardRiskCountsFragment;
      rows: DashboardRiskRowFragment[];
    }
  | {
      providerId: string;
      status: 'unavailable';
    };
