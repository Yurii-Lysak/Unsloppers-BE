import type {
  DashboardBlockId,
  DashboardCounterSpecEntity,
  DashboardGrouping,
  DashboardQuickNavLinkEntity,
  DashboardVariant,
} from './entities/dashboard-config.entity';

export const UM_QUICK_NAV_LINKS: DashboardQuickNavLinkEntity[] = [
  { labelKey: 'dashboard.quickNav.employees', path: '/employees' },
  { labelKey: 'dashboard.quickNav.savedViews', path: '/employees' },
  { labelKey: 'dashboard.quickNav.resourcing', path: '/resourcing' },
  { labelKey: 'dashboard.quickNav.risks', path: '/risks' },
  { labelKey: 'dashboard.quickNav.mentorship', path: '/mentorship' },
  { labelKey: 'dashboard.quickNav.campaigns', path: '/campaigns' },
];

export const DM_QUICK_NAV_LINKS: DashboardQuickNavLinkEntity[] = [
  { labelKey: 'dashboard.quickNav.employees', path: '/employees' },
  { labelKey: 'dashboard.quickNav.risks', path: '/risks' },
  { labelKey: 'dashboard.quickNav.campaigns', path: '/campaigns' },
];

export const PP_QUICK_NAV_LINKS: DashboardQuickNavLinkEntity[] = [
  { labelKey: 'dashboard.quickNav.employees', path: '/employees' },
  { labelKey: 'dashboard.quickNav.risks', path: '/risks' },
  { labelKey: 'dashboard.quickNav.mentorship', path: '/mentorship' },
  { labelKey: 'dashboard.quickNav.campaigns', path: '/campaigns' },
];

const UM_COUNTERS: DashboardCounterSpecEntity[] = [
  {
    id: 'headcount',
    providerId: 'audience',
    labelKey: 'dashboard.counters.headcount',
  },
  {
    id: 'need_attention',
    providerId: 'risks',
    labelKey: 'dashboard.counters.needAttention',
  },
  {
    id: 'medium',
    providerId: 'risks',
    labelKey: 'dashboard.counters.medium',
  },
  {
    id: 'high',
    providerId: 'risks',
    labelKey: 'dashboard.counters.high',
  },
  {
    id: 'leaver',
    providerId: 'risks',
    labelKey: 'dashboard.counters.leaver',
  },
  {
    id: 'openActionItems',
    providerId: 'action-items',
    labelKey: 'dashboard.counters.openActionItems',
  },
  {
    id: 'overdueActionItems',
    providerId: 'action-items',
    labelKey: 'dashboard.counters.overdueActionItems',
  },
  {
    id: 'openResourcingRequests',
    providerId: 'resourcing',
    labelKey: 'dashboard.counters.openResourcingRequests',
  },
  {
    id: 'openCampaigns',
    providerId: 'campaigns',
    labelKey: 'dashboard.counters.openCampaigns',
  },
];

const PP_COUNTERS: DashboardCounterSpecEntity[] = UM_COUNTERS.filter(
  (counter) => counter.id !== 'openResourcingRequests',
);

const DM_COUNTERS: DashboardCounterSpecEntity[] = [
  {
    id: 'headcount',
    providerId: 'audience',
    labelKey: 'dashboard.counters.headcount',
  },
  {
    id: 'need_attention',
    providerId: 'risks',
    labelKey: 'dashboard.counters.needAttention',
  },
  {
    id: 'medium',
    providerId: 'risks',
    labelKey: 'dashboard.counters.medium',
  },
  {
    id: 'high',
    providerId: 'risks',
    labelKey: 'dashboard.counters.high',
  },
  {
    id: 'leaver',
    providerId: 'risks',
    labelKey: 'dashboard.counters.leaver',
  },
  {
    id: 'openResourcingRequests',
    providerId: 'resourcing',
    labelKey: 'dashboard.counters.openResourcingRequests',
  },
];

export interface DashboardVariantDefinition {
  variant: DashboardVariant;
  grouping: DashboardGrouping;
  blocks: DashboardBlockId[];
  counters: DashboardCounterSpecEntity[];
  quickNav: DashboardQuickNavLinkEntity[];
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
    quickNav: UM_QUICK_NAV_LINKS,
  },
  dm: {
    variant: 'dm',
    grouping: 'project',
    blocks: [
      'counters',
      'table',
      'resourcingRequests',
      'ownActionItems',
      'quickNav',
    ],
    counters: DM_COUNTERS,
    quickNav: DM_QUICK_NAV_LINKS,
  },
  pm: {
    variant: 'pm',
    grouping: 'project',
    blocks: [
      'counters',
      'table',
      'resourcingRequests',
      'ownActionItems',
      'quickNav',
    ],
    counters: DM_COUNTERS,
    quickNav: DM_QUICK_NAV_LINKS,
  },
  pp: {
    variant: 'pp',
    grouping: 'people',
    blocks: ['counters', 'table', 'idpDeadlines', 'ownActionItems', 'quickNav'],
    counters: PP_COUNTERS,
    quickNav: PP_QUICK_NAV_LINKS,
  },
};
