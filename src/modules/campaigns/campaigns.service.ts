import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { FormCampaign, User } from '../../generated/prisma/client';
import type { FieldFilter } from '../contracts/field-registry.contract';
import { EmployeesService } from '../directory/employees.service';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MIN_PAGE,
} from '../directory/field-catalog';
import type { EmployeeRowEntity } from '../directory/entities/employee-list.entity';
import { PrismaService } from '../../prisma/prisma.service';
import {
  assertNoDuplicateIds,
  assertValidUuidIds,
  normalizeAudienceDefinition,
  parseStoredAudienceFilters,
  resolveAudienceIds,
  toFieldFilters,
  type CampaignAudienceDefinition,
} from './campaign-audience';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { PreviewCampaignAudienceQueryDto } from './dto/preview-campaign-audience-query.dto';
import { SaveCampaignAudienceDto } from './dto/save-campaign-audience.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import {
  formatCampaignDueDate,
  normalizeCampaignFields,
  normalizePartialCampaignFields,
} from './campaign-input';
import { CampaignAudiencePreviewEntity } from './entities/campaign-audience.entity';
import { CampaignReadEntity } from './entities/campaign.entity';

type CampaignWithCreator = FormCampaign & {
  creator: {
    id: string;
    user: Pick<User, 'name' | 'email'>;
  };
};

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employeesService: EmployeesService,
  ) {}

  async createCampaign(
    creatorId: string,
    dto: CreateCampaignDto,
  ): Promise<CampaignReadEntity> {
    const normalized = normalizeCampaignFields(dto);
    const campaign = await this.prisma.formCampaign.create({
      data: {
        creatorId,
        title: normalized.title,
        description: normalized.description,
        purpose: normalized.purpose,
        link: normalized.link,
        dueDate: normalized.dueDate,
        status: 'draft',
      },
      include: this.creatorInclude,
    });
    return this.toReadDto(campaign);
  }

  async listForCreator(creatorId: string): Promise<CampaignReadEntity[]> {
    const campaigns = await this.prisma.formCampaign.findMany({
      where: { creatorId },
      include: this.creatorInclude,
      orderBy: { createdAt: 'desc' },
    });
    return campaigns.map((campaign) => this.toReadDto(campaign));
  }

  async getForCreator(
    campaignId: string,
    creatorId: string,
  ): Promise<CampaignReadEntity> {
    const campaign = await this.findOwnedCampaign(campaignId, creatorId);
    return this.toReadDto(campaign);
  }

  async updateDraft(
    campaignId: string,
    creatorId: string,
    dto: UpdateCampaignDto,
  ): Promise<CampaignReadEntity> {
    await this.findOwnedCampaign(campaignId, creatorId);

    const normalized = normalizePartialCampaignFields(dto);
    const result = await this.prisma.formCampaign.updateMany({
      where: { id: campaignId, status: 'draft' },
      data: normalized,
    });
    if (result.count === 0) {
      throw new ConflictException('Only draft campaigns can be edited');
    }

    return this.getForCreator(campaignId, creatorId);
  }

  async saveAudience(
    campaignId: string,
    creatorId: string,
    dto: SaveCampaignAudienceDto,
  ): Promise<CampaignReadEntity> {
    await this.findOwnedCampaign(campaignId, creatorId);

    assertNoDuplicateIds(dto.addedEmployeeIds, 'addedEmployeeIds');
    assertNoDuplicateIds(dto.excludedEmployeeIds, 'excludedEmployeeIds');
    assertValidUuidIds(dto.addedEmployeeIds);
    assertValidUuidIds(dto.excludedEmployeeIds);

    const viewerUserId = await this.resolveCreatorUserId(creatorId);
    const filters = toFieldFilters(dto.filters);
    const normalized = normalizeAudienceDefinition({
      filters,
      addedEmployeeIds: dto.addedEmployeeIds,
      excludedEmployeeIds: dto.excludedEmployeeIds,
    });

    await this.validateAddedEmployeeIds(
      viewerUserId,
      normalized.addedEmployeeIds,
    );
    const filterMatchIds = await this.collectFilterMatchIds(
      viewerUserId,
      normalized.filters,
    );
    this.validateExcludedEmployeeIds(
      normalized.excludedEmployeeIds,
      filterMatchIds,
    );

    const result = await this.prisma.formCampaign.updateMany({
      where: { id: campaignId, status: 'draft' },
      data: {
        audienceFilters: normalized.filters,
        audienceAddedEmployeeIds: normalized.addedEmployeeIds,
        audienceExcludedEmployeeIds: normalized.excludedEmployeeIds,
      },
    });
    if (result.count === 0) {
      throw new ConflictException('Only draft campaigns can be edited');
    }

    return this.getForCreator(campaignId, creatorId);
  }

  async previewAudience(
    campaignId: string,
    creatorId: string,
    viewerUserId: string,
    query: PreviewCampaignAudienceQueryDto,
  ): Promise<CampaignAudiencePreviewEntity> {
    const campaign = await this.findOwnedDraftCampaign(campaignId, creatorId);
    const definition = this.toAudienceDefinition(campaign);
    const resolvedIds = await this.resolveAudienceEmployeeIdsForDefinition(
      viewerUserId,
      definition,
    );

    const page = query.page ?? MIN_PAGE;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const pageIds = resolvedIds.slice((page - 1) * pageSize, page * pageSize);
    const rowMap = await this.loadRowMap(viewerUserId, definition);
    const rows = pageIds
      .map((employeeId) => rowMap.get(employeeId))
      .filter((row): row is EmployeeRowEntity => row !== undefined);

    const sample = await this.employeesService.listEmployees(viewerUserId, {
      page: MIN_PAGE,
      pageSize: 1,
    });

    return {
      fields: sample.fields,
      rows,
      total: resolvedIds.length,
      page,
      pageSize,
    };
  }

  async resolveAudienceEmployeeIds(
    campaignId: string,
    creatorId: string,
  ): Promise<string[]> {
    const campaign = await this.findOwnedDraftCampaign(campaignId, creatorId);
    const viewerUserId = await this.resolveCreatorUserId(creatorId);
    return this.resolveAudienceEmployeeIdsForDefinition(
      viewerUserId,
      this.toAudienceDefinition(campaign),
    );
  }

  private async resolveAudienceEmployeeIdsForDefinition(
    viewerUserId: string,
    definition: CampaignAudienceDefinition,
  ): Promise<string[]> {
    const filterMatchIds = await this.collectFilterMatchIds(
      viewerUserId,
      definition.filters,
    );
    return resolveAudienceIds(filterMatchIds, definition);
  }

  private async collectFilterMatchIds(
    viewerUserId: string,
    filters: FieldFilter[],
  ): Promise<string[]> {
    if (filters.length === 0) {
      return [];
    }
    const ids: string[] = [];
    let page = MIN_PAGE;
    while (true) {
      const result = await this.employeesService.listEmployees(viewerUserId, {
        filters,
        page,
        pageSize: MAX_PAGE_SIZE,
      });
      ids.push(...result.rows.map((row) => row.employeeId));
      if (ids.length >= result.total) {
        break;
      }
      page += 1;
    }
    return ids;
  }

  private async loadRowMap(
    viewerUserId: string,
    definition: CampaignAudienceDefinition,
  ): Promise<Map<string, EmployeeRowEntity>> {
    const rowMap = new Map<string, EmployeeRowEntity>();

    if (definition.filters.length > 0) {
      let page = MIN_PAGE;
      while (true) {
        const result = await this.employeesService.listEmployees(viewerUserId, {
          filters: definition.filters,
          page,
          pageSize: MAX_PAGE_SIZE,
        });
        for (const row of result.rows) {
          rowMap.set(row.employeeId, {
            employeeId: row.employeeId,
            cells: row.cells,
          });
        }
        if (page * MAX_PAGE_SIZE >= result.total) {
          break;
        }
        page += 1;
      }
    }

    const missingAddedIds = definition.addedEmployeeIds.filter(
      (id) => !rowMap.has(id),
    );
    if (missingAddedIds.length > 0) {
      let page = MIN_PAGE;
      while (true) {
        const result = await this.employeesService.listEmployees(viewerUserId, {
          page,
          pageSize: MAX_PAGE_SIZE,
        });
        for (const row of result.rows) {
          if (missingAddedIds.includes(row.employeeId)) {
            rowMap.set(row.employeeId, {
              employeeId: row.employeeId,
              cells: row.cells,
            });
          }
        }
        if (page * MAX_PAGE_SIZE >= result.total) {
          break;
        }
        page += 1;
      }
    }

    return rowMap;
  }

  private async validateAddedEmployeeIds(
    viewerUserId: string,
    addedEmployeeIds: string[],
  ): Promise<void> {
    if (addedEmployeeIds.length === 0) {
      return;
    }

    const visibleIds = await this.collectVisibleEmployeeIds(viewerUserId);
    const activeEmployees = await this.prisma.employee.findMany({
      where: {
        id: { in: addedEmployeeIds },
        employmentStatus: 'active',
      },
      select: { id: true },
    });
    const activeIdSet = new Set(activeEmployees.map((entry) => entry.id));

    const invalidEmployeeIds = addedEmployeeIds.filter(
      (id) => !visibleIds.has(id) || !activeIdSet.has(id),
    );
    if (invalidEmployeeIds.length > 0) {
      throw new BadRequestException({
        message: 'Invalid added employee ids',
        invalidEmployeeIds,
      });
    }
  }

  private validateExcludedEmployeeIds(
    excludedEmployeeIds: string[],
    filterMatchIds: string[],
  ): void {
    if (excludedEmployeeIds.length === 0) {
      return;
    }
    const filterMatchSet = new Set(filterMatchIds);
    const invalidExcludedEmployeeIds = excludedEmployeeIds.filter(
      (id) => !filterMatchSet.has(id),
    );
    if (invalidExcludedEmployeeIds.length > 0) {
      throw new BadRequestException({
        message: 'Excluded employee ids must be current filter matches',
        invalidExcludedEmployeeIds,
      });
    }
  }

  private async collectVisibleEmployeeIds(
    viewerUserId: string,
  ): Promise<Set<string>> {
    const ids = new Set<string>();
    let page = MIN_PAGE;
    while (true) {
      const result = await this.employeesService.listEmployees(viewerUserId, {
        page,
        pageSize: MAX_PAGE_SIZE,
      });
      for (const row of result.rows) {
        ids.add(row.employeeId);
      }
      if (page * MAX_PAGE_SIZE >= result.total) {
        break;
      }
      page += 1;
    }
    return ids;
  }

  private async findOwnedDraftCampaign(
    campaignId: string,
    creatorId: string,
  ): Promise<CampaignWithCreator> {
    const campaign = await this.findOwnedCampaign(campaignId, creatorId);
    if (campaign.status !== 'draft') {
      throw new ConflictException('Only draft campaigns can be edited');
    }
    return campaign;
  }

  private async resolveCreatorUserId(creatorId: string): Promise<string> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: creatorId },
      select: { userId: true },
    });
    if (!employee) {
      throw new NotFoundException(`Employee ${creatorId} not found`);
    }
    return employee.userId;
  }

  private toAudienceDefinition(
    campaign: CampaignWithCreator,
  ): CampaignAudienceDefinition {
    return {
      filters: parseStoredAudienceFilters(campaign.audienceFilters),
      addedEmployeeIds: campaign.audienceAddedEmployeeIds,
      excludedEmployeeIds: campaign.audienceExcludedEmployeeIds,
    };
  }

  private readonly creatorInclude = {
    creator: {
      include: {
        user: { select: { name: true, email: true } },
      },
    },
  } as const;

  private async findOwnedCampaign(
    campaignId: string,
    creatorId: string,
  ): Promise<CampaignWithCreator> {
    const campaign = await this.prisma.formCampaign.findFirst({
      where: { id: campaignId, creatorId },
      include: this.creatorInclude,
    });
    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }
    return campaign;
  }

  private toReadDto(campaign: CampaignWithCreator): CampaignReadEntity {
    return {
      id: campaign.id,
      title: campaign.title,
      description: campaign.description,
      purpose: campaign.purpose,
      link: campaign.link,
      dueDate: formatCampaignDueDate(campaign.dueDate),
      status: campaign.status,
      creator: {
        id: campaign.creator.id,
        displayName: this.displayName(campaign.creator.user),
      },
      createdAt: campaign.createdAt.toISOString(),
      updatedAt: campaign.updatedAt.toISOString(),
      audience: {
        filters: parseStoredAudienceFilters(campaign.audienceFilters),
        addedEmployeeIds: campaign.audienceAddedEmployeeIds,
        excludedEmployeeIds: campaign.audienceExcludedEmployeeIds,
      },
    };
  }

  private displayName(user: Pick<User, 'name' | 'email'>): string {
    const name = user.name?.trim();
    if (name) {
      return name;
    }
    if (user.email) {
      return user.email;
    }
    return 'Unknown';
  }
}
