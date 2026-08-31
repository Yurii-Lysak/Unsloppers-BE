import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ExternalIdentityMapping,
  ExternalIdentityMappingDto,
  ExternalIdentitySystem,
} from '../contracts/external-identity-mapping.contract';

/** C5 real implementation — Story 13.1 (Wave-1 shape; 13.4 may refine). */
@Injectable()
export class ExternalIdentityMappingService extends ExternalIdentityMapping {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findByExternalId(
    system: ExternalIdentitySystem,
    externalId: string,
  ): Promise<ExternalIdentityMappingDto | null> {
    const row = await this.prisma.externalIdentity.findUnique({
      where: {
        system_externalId: {
          system,
          externalId,
        },
      },
    });
    if (!row) {
      return null;
    }

    if (row.supersededBy) {
      const current = await this.prisma.externalIdentity.findUnique({
        where: { id: row.supersededBy },
      });
      if (!current) {
        return null;
      }
      return this.toDto(current);
    }

    return this.toDto(row);
  }

  async listByEmployee(
    employeeId: string,
  ): Promise<ExternalIdentityMappingDto[]> {
    const rows = await this.prisma.externalIdentity.findMany({
      where: { employeeId, supersededBy: null },
    });
    return rows.map((row) => this.toDto(row));
  }

  async findTimetrackerExternalId(employeeId: string): Promise<string | null> {
    const mappings = await this.listByEmployee(employeeId);
    const timetracker = mappings.find(
      (mapping) => mapping.system === 'timetracker',
    );
    return timetracker?.externalId ?? null;
  }

  private toDto(row: {
    system: ExternalIdentitySystem;
    externalId: string;
    employeeId: string;
    supersededBy: string | null;
  }): ExternalIdentityMappingDto {
    return {
      system: row.system,
      externalId: row.externalId,
      employeeId: row.employeeId,
      supersededBy: row.supersededBy ?? undefined,
    };
  }
}
