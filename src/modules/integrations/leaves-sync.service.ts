import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock } from '../../clock/clock.service';
import { TimetrackerClient } from '../contracts/timetracker-client.contract';
import { TimetrackerApiError } from '../contracts/timetracker.errors';
import { WorkingDay } from '../contracts/timetracker.types';
import { ExternalIdentityMappingService } from './external-identity-mapping.service';
import {
  NormalizedLeavePeriod,
  groupLeavePeriods,
} from './leave-period.mapper';

const LEAVES_CACHE_TTL_MS = 5 * 60 * 1000;

export type LeavesFetchResult =
  | { availability: 'ok'; leaves: NormalizedLeavePeriod[] }
  | { availability: 'unavailable'; leaves: [] };

interface MonthCacheEntry {
  fetchedAt: number;
  daysByEmployeeId: Map<number, WorkingDay[]>;
}

@Injectable()
export class LeavesSyncService {
  private readonly logger = new Logger(LeavesSyncService.name);
  private readonly monthCache = new Map<string, MonthCacheEntry>();

  constructor(
    private readonly timetracker: TimetrackerClient,
    private readonly identityMapping: ExternalIdentityMappingService,
    private readonly config: ConfigService,
    private readonly clock: Clock,
  ) {}

  async getLeavesForEmployee(employeeId: string): Promise<LeavesFetchResult> {
    const externalId =
      await this.identityMapping.findTimetrackerExternalId(employeeId);
    if (!externalId) {
      this.logger.debug(
        `No timetracker mapping for employeeId=${employeeId}; returning empty S10.`,
      );
      return { availability: 'ok', leaves: [] };
    }

    if (!this.config.get<string>('TIMETRACKER_ACCOUNTING_API_KEY')?.trim()) {
      this.logger.warn(
        'TIMETRACKER_ACCOUNTING_API_KEY is unset; S10 unavailable.',
      );
      return { availability: 'unavailable', leaves: [] };
    }

    const timetrackerEmployeeId = Number(externalId);
    if (!Number.isFinite(timetrackerEmployeeId)) {
      this.logger.warn(
        `Invalid timetracker externalId="${externalId}" for employeeId=${employeeId}.`,
      );
      return { availability: 'ok', leaves: [] };
    }

    try {
      const now = this.clock.now();
      const allDays: WorkingDay[] = [];

      for (const { month, year } of monthsToQuery(now)) {
        const daysByEmployeeId = await this.loadMonthDays(
          month,
          year,
          timetrackerEmployeeId,
        );
        allDays.push(...(daysByEmployeeId.get(timetrackerEmployeeId) ?? []));
      }

      return {
        availability: 'ok',
        leaves: groupLeavePeriods(dedupeWorkingDaysByDate(allDays)),
      };
    } catch (error) {
      if (error instanceof TimetrackerApiError) {
        this.logger.warn(
          `TimeTracker leaves fetch failed for employeeId=${employeeId}: ${error.message}`,
        );
        return { availability: 'unavailable', leaves: [] };
      }
      throw error;
    }
  }

  getManageLeaveUrl(): string | null {
    const url = this.config.get<string>('TIMETRACKER_MANAGE_LEAVE_URL');
    return url?.trim() ? url : null;
  }

  /** Visible for tests that need to prime or inspect the month cache. */
  clearCache(): void {
    this.monthCache.clear();
  }

  private async loadMonthDays(
    month: number,
    year: number,
    timetrackerEmployeeId: number,
  ): Promise<Map<number, WorkingDay[]>> {
    const cacheKey = `${year}-${month}:${timetrackerEmployeeId}`;
    const cached = this.monthCache.get(cacheKey);
    const nowMs = this.clock.now().getTime();

    if (cached && nowMs - cached.fetchedAt < LEAVES_CACHE_TTL_MS) {
      return cached.daysByEmployeeId;
    }

    const report = await this.timetracker.fetchAccountingReport({
      month,
      year,
      employeeIds: [timetrackerEmployeeId],
    });
    const daysByEmployeeId = new Map<number, WorkingDay[]>();
    for (const employee of report.employees) {
      daysByEmployeeId.set(employee.id, employee.days ?? []);
    }

    this.monthCache.set(cacheKey, {
      fetchedAt: nowMs,
      daysByEmployeeId,
    });

    return daysByEmployeeId;
  }
}

function monthsToQuery(now: Date): Array<{ month: number; year: number }> {
  const month = now.getUTCMonth() + 1;
  const year = now.getUTCFullYear();
  const previous =
    month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };
  const next =
    month === 12 ? { month: 1, year: year + 1 } : { month: month + 1, year };
  return [previous, { month, year }, next];
}

function dedupeWorkingDaysByDate(days: WorkingDay[]): WorkingDay[] {
  const byDate = new Map<string, WorkingDay>();
  for (const day of days) {
    byDate.set(day.date, day);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
