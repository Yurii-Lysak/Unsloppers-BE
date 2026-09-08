export type DashboardVariant = 'um' | 'dm' | 'pm' | 'pp';

export type DashboardVariantResolvedBy = 'seed-map' | 'functional-role';

export interface DashboardVariantResolution {
  variant: DashboardVariant | null;
  resolvedBy: DashboardVariantResolvedBy;
}

export abstract class DashboardVariantResolver {
  abstract resolveVariant(
    viewerEmployeeId: string,
  ): Promise<DashboardVariantResolution>;
}
