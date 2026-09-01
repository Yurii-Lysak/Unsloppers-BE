import { Injectable, Logger } from '@nestjs/common';
import { Clock } from '../../clock/clock.service';
import { ProjectAssignmentSource } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TimetrackerClient } from '../contracts/timetracker-client.contract';
import { TimetrackerApiError } from '../contracts/timetracker.errors';
import { ProjectStatus } from '../contracts/timetracker.types';
import {
  ProjectAssignmentMapper,
  TimetrackerProjectsPayloadError,
} from './project-assignment.mapper';

const TIMETRACKER_SOURCE = ProjectAssignmentSource.timetracker;

export type ProjectsSyncResult =
  | { status: 'succeeded'; confirmed: number; deconfirmed: number }
  | { status: 'failed' }
  | { status: 'skipped' };

@Injectable()
export class ProjectsSyncService {
  private readonly logger = new Logger(ProjectsSyncService.name);
  private running = false;

  constructor(
    private readonly timetracker: TimetrackerClient,
    private readonly mapper: ProjectAssignmentMapper,
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async sync(): Promise<ProjectsSyncResult> {
    if (this.running) {
      this.logger.debug('TimeTracker project sync skipped: already running.');
      return { status: 'skipped' };
    }

    this.running = true;
    try {
      const confirmedAt = this.clock.now();
      const month = confirmedAt.getUTCMonth() + 1;
      const year = confirmedAt.getUTCFullYear();
      const [directoryResult, projectsResult] = await Promise.allSettled([
        this.timetracker.fetchAccountingReport({ month, year }),
        this.timetracker.fetchTalentsProjects([
          ProjectStatus.Active,
          ProjectStatus.Support,
        ]),
      ]);
      if (directoryResult.status === 'rejected') {
        throw directoryResult.reason;
      }
      if (projectsResult.status === 'rejected') {
        throw projectsResult.reason;
      }
      const directory = directoryResult.value;
      const projects = projectsResult.value;
      if (
        !Array.isArray(directory.employees) ||
        !Array.isArray(projects.projects)
      ) {
        throw new TimetrackerProjectsPayloadError();
      }
      const mapped = await this.mapper.map(
        projects.projects,
        directory.employees,
      );
      const sourceKeys = mapped.assignments.map(
        (assignment) => assignment.sourceKey,
      );

      const deconfirmed = await this.prisma.$transaction(async (tx) => {
        for (const assignment of mapped.assignments) {
          await tx.projectAssignment.upsert({
            where: { sourceKey: assignment.sourceKey },
            create: {
              ...assignment,
              source: TIMETRACKER_SOURCE,
              confirmed: true,
              confirmedAt,
            },
            update: {
              employeeId: assignment.employeeId,
              projectId: assignment.projectId,
              pmId: assignment.pmId,
              dmId: assignment.dmId,
              startDate: assignment.startDate,
              endDate: assignment.endDate,
              confirmed: true,
              confirmedAt,
            },
          });
        }

        const missing = await tx.projectAssignment.updateMany({
          where: {
            source: TIMETRACKER_SOURCE,
            ...(sourceKeys.length > 0
              ? { sourceKey: { notIn: sourceKeys } }
              : {}),
            confirmed: true,
          },
          data: { confirmed: false },
        });
        return missing.count;
      });

      this.logger.log(
        [
          'TimeTracker project sync succeeded',
          `confirmed=${mapped.assignments.length}`,
          `deconfirmed=${deconfirmed}`,
          `omitted=${mapped.omissions.omittedAssignments}`,
          `directoryMisses=${mapped.omissions.directoryMisses}`,
          `identityMisses=${mapped.omissions.identityMisses}`,
          `duplicates=${mapped.omissions.duplicateAssignments}`,
        ].join(' '),
      );
      return {
        status: 'succeeded',
        confirmed: mapped.assignments.length,
        deconfirmed,
      };
    } catch (error) {
      this.logger.warn(
        `TimeTracker project sync failed; assignments unchanged (${describeFailure(error)}).`,
      );
      return { status: 'failed' };
    } finally {
      this.running = false;
    }
  }
}

function describeFailure(error: unknown): string {
  if (error instanceof TimetrackerApiError) {
    return `endpoint=${error.endpoint} status=${error.status ?? 'network'}`;
  }
  return `type=${error instanceof Error ? error.name : 'unknown'}`;
}
