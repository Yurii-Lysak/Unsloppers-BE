import type {
  DashboardBlockId,
  DashboardCounterSpecEntity,
  DashboardGrouping,
  DashboardVariant,
} from './entities/dashboard-config.entity';

export const QUICK_NAV_LINKS: ReadonlyArray<{
  labelKey: string;
  path: string;
}> = [
  { labelKey: 'dashboard.quickNav.employees', path: '/employees' },
  { labelKey: 'dashboard.quickNav.risks', path: '/risks' },
  { labelKey: 'dashboard.quickNav.campaigns', path: '/campaigns' },
];

const UM_COUNTERS: DashboardCounterSpecEntity[] = [
  {
    id: 'headcount',
    providerId: 'audience',
    labelKey: 'dashboard.counters.headcount',
  },
  {
    id: 'totalActive',
    providerId: 'risks',
    labelKey: 'dashboard.counters.activeRisk',
  },
];

const DM_COUNTERS: DashboardCounterSpecEntity[] = [
  {
    id: 'headcount',
    providerId: 'audience',
    labelKey: 'dashboard.counters.headcount',
  },
  {
    id: 'totalActive',
    providerId: 'risks',
    labelKey: 'dashboard.counters.activeRisk',
  },
];

export interface DashboardVariantDefinition {
  variant: DashboardVariant;
  grouping: DashboardGrouping;
  blocks: DashboardBlockId[];
  counters: DashboardCounterSpecEntity[];
}

export const DASHBOARD_VARIANT_DEFINITIONS: Record<
  DashboardVariant,
  DashboardVariantDefinition
> = {
  um: {
    variant: 'um',
    grouping: 'people',
    blocks: ['counters', 'table', 'ownActionItems', 'quickNav'],
    counters: UM_COUNTERS,
  },
  dm: {
    variant: 'dm',
    grouping: 'project',
    blocks: ['counters', 'table', 'ownActionItems', 'quickNav'],
    counters: DM_COUNTERS,
  },
  pm: {
    variant: 'pm',
    grouping: 'project',
    blocks: ['counters', 'table', 'ownActionItems', 'quickNav'],
    counters: [],
  },
  pp: {
    variant: 'pp',
    grouping: 'people',
    blocks: ['counters', 'table', 'ownActionItems', 'quickNav'],
    counters: [],
  },
};
