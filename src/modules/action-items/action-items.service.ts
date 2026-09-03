import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { Prisma } from '../../generated/prisma/client';
import type { ActionItem, User } from '../../generated/prisma/client';
import { Clock } from '../../clock/clock.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AccessResolver,
  ResolvedAudience,
} from '../contracts/access-resolver.contract';
import {
  ActionItemCreation,
  ActionItemDto,
  ActionItemWriteContext,
  CampaignPersistedActionItem,
  CreateActionItemInput,
  CreateCampaignActionItemsInput,
} from '../contracts/action-item-creation.contract';
import {
  formatActionItemDueDate,
  isActionItemOverdue,
  normalizeActionItemFields,
} from './action-item-input';
import { CreateActionItemDto } from './dto/create-action-item.dto';
import {
  ActionItemReadEntity,
  ActionItemsSectionEntity,
  AuthoredActionItemReadEntity,
} from './entities/action-item.entity';

type ActionItemWithPeople = ActionItem & {
  author: {
    id: string;
    user: Pick<User, 'name' | 'email'>;
  };
  assignee: {
    id: string;
    user: Pick<User, 'name' | 'email'>;
  };
};

@Injectable()
export class ActionItemsService extends ActionItemCreation {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessResolver: AccessResolver,
    private readonly clock: Clock,
  ) {
    super();
  }

  async createActionItem(input: CreateActionItemInput): Promise<ActionItemDto> {
    if (input.source === 'campaign') {
      throw new BadRequestException(
        'use createCampaignActionItems for campaign activation',
      );
    }
    const normalized = normalizeActionItemFields({
      title: input.title,
      description: input.description,
      dueDate: input.dueDate,
      link: input.link,
    });
    const item = await this.persistActionItem({
      assigneeId: input.assigneeId,
      authorId: input.authorId,
      ...normalized,
      source: input.source,
      campaignId: input.campaignId ?? null,
    });
    return this.toContractDto(item);
  }

  async createCampaignActionItems(
    input: CreateCampaignActionItemsInput,
    tx?: ActionItemWriteContext,
  ): Promise<ActionItemDto[]> {
    this.assertCampaignInputUuids(input);
    const normalized = normalizeActionItemFields({
      title: input.title,
      description: input.description,
      dueDate: input.dueDate,
      link: input.link,
    });

    if (tx) {
      return this.runCampaignActivation(input, normalized, tx);
    }

    return this.prisma.$transaction((prismaTx) =>
      this.runCampaignActivation(input, normalized, prismaTx),
    );
  }

  async createManualItem(
    assigneeId: string,
    authorId: string,
    dto: CreateActionItemDto,
  ): Promise<ActionItemReadEntity> {
    const normalized = normalizeActionItemFields({
      title: dto.title,
      description: dto.description,
      dueDate: dto.dueDate,
      link: dto.link,
    });
    const item = await this.persistActionItem({
      assigneeId,
      authorId,
      ...normalized,
      source: 'manual',
      campaignId: null,
    });
    return this.toReadDto(item);
  }

  async completeActionItem(
    assigneeEmployeeId: string,
    itemId: string,
    viewerEmployeeId: string,
  ): Promise<ActionItemReadEntity> {
    const item = await this.findItemForAssignee(assigneeEmployeeId, itemId);
    if (viewerEmployeeId !== item.assigneeId) {
      throw new ForbiddenException(
        'Only the assignee may complete this action item',
      );
    }
    if (item.status !== 'open') {
      throw new ConflictException({
        message: 'Action item is not open',
        status: item.status,
      });
    }

    const result = await this.prisma.actionItem.updateMany({
      where: { id: item.id, status: 'open' },
      data: {
        status: 'completed',
        completedAt: this.clock.now(),
      },
    });
    if (result.count === 0) {
      const current = await this.findItemForAssignee(
        assigneeEmployeeId,
        itemId,
      );
      throw new ConflictException({
        message: 'Action item is not open',
        status: current.status,
      });
    }

    const updated = await this.prisma.actionItem.findFirst({
      where: { id: item.id },
      include: this.peopleInclude,
    });
    if (!updated) {
      throw new NotFoundException(`Action item ${itemId} not found`);
    }
    return this.toReadDto(updated);
  }

  async cancelActionItem(
    itemId: string,
    authorEmployeeId: string,
    body?: { reason?: unknown },
  ): Promise<ActionItemReadEntity> {
    const item = await this.findItemForAuthor(itemId, authorEmployeeId);

    if (item.status === 'cancelled') {
      return this.toReadDto(item);
    }

    if (item.status === 'completed') {
      throw new ConflictException({
        message: 'Completed action items cannot be cancelled',
        status: item.status,
      });
    }

    const reason =
      typeof body?.reason === 'string' ? body.reason.trim() : undefined;
    if (!reason) {
      throw new BadRequestException('Cancellation reason is required');
    }
    if (reason.length > 2000) {
      throw new BadRequestException(
        'Cancellation reason must be at most 2000 characters',
      );
    }

    const result = await this.prisma.actionItem.updateMany({
      where: { id: item.id, status: 'open' },
      data: {
        status: 'cancelled',
        cancelledAt: this.clock.now(),
        cancelledReason: reason,
      },
    });
    if (result.count === 0) {
      const current = await this.findItemForAuthor(itemId, authorEmployeeId);
      if (current.status === 'cancelled') {
        return this.toReadDto(current);
      }
      if (current.status === 'completed') {
        throw new ConflictException({
          message: 'Completed action items cannot be cancelled',
          status: current.status,
        });
      }
      throw new ConflictException({
        message: 'Action item is not open',
        status: current.status,
      });
    }

    const updated = await this.prisma.actionItem.findFirst({
      where: { id: item.id },
      include: this.peopleInclude,
    });
    if (!updated) {
      throw new NotFoundException(`Action item ${itemId} not found`);
    }
    return this.toReadDto(updated);
  }

  async buildSection(
    subjectEmployeeId: string,
    audience: ResolvedAudience,
  ): Promise<ActionItemsSectionEntity> {
    let items = await this.loadItemsForAssignee(subjectEmployeeId);
    const accessLevel = audience.sections.S14;
    if (accessLevel === 'R' && audience.role === 'Self') {
      items = items.filter((item) => item.assigneeId === subjectEmployeeId);
    }
    return {
      items: items.map((item) => this.toReadDto(item)),
    };
  }

  async listAuthoredOpenItems(
    authorEmployeeId: string,
  ): Promise<AuthoredActionItemReadEntity[]> {
    const items = await this.prisma.actionItem.findMany({
      where: {
        authorId: authorEmployeeId,
        status: 'open',
      },
      include: this.peopleInclude,
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    });

    const visible: AuthoredActionItemReadEntity[] = [];
    for (const item of items) {
      const audience = await this.accessResolver.resolveAudience(
        authorEmployeeId,
        item.assigneeId,
      );
      if (audience.sections.S14 === 'none') {
        continue;
      }
      visible.push(this.toAuthoredDto(item));
    }
    return visible;
  }

  private readonly peopleInclude = {
    author: {
      include: {
        user: { select: { name: true, email: true } },
      },
    },
    assignee: {
      include: {
        user: { select: { name: true, email: true } },
      },
    },
  } as const;

  private async findItemForAssignee(
    assigneeEmployeeId: string,
    itemId: string,
  ): Promise<ActionItemWithPeople> {
    const item = await this.prisma.actionItem.findFirst({
      where: { id: itemId, assigneeId: assigneeEmployeeId },
      include: this.peopleInclude,
    });
    if (!item) {
      throw new NotFoundException(`Action item ${itemId} not found`);
    }
    return item;
  }

  private async findItemForAuthor(
    itemId: string,
    authorEmployeeId: string,
  ): Promise<ActionItemWithPeople> {
    const item = await this.prisma.actionItem.findFirst({
      where: { id: itemId, authorId: authorEmployeeId },
      include: this.peopleInclude,
    });
    if (!item) {
      throw new NotFoundException(`Action item ${itemId} not found`);
    }
    return item;
  }

  private async persistActionItem(data: {
    assigneeId: string;
    authorId: string;
    title: string;
    description: string | null;
    dueDate: Date;
    link: string | null;
    source: CreateActionItemInput['source'];
    campaignId: string | null;
  }): Promise<ActionItemWithPeople> {
    return this.prisma.actionItem.create({
      data: {
        assigneeId: data.assigneeId,
        authorId: data.authorId,
        title: data.title,
        description: data.description,
        dueDate: data.dueDate,
        link: data.link,
        source: data.source,
        campaignId: data.campaignId,
        status: 'open',
      },
      include: this.peopleInclude,
    });
  }

  private async loadItemsForAssignee(
    assigneeId: string,
  ): Promise<ActionItemWithPeople[]> {
    return this.prisma.actionItem.findMany({
      where: { assigneeId },
      include: this.peopleInclude,
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    });
  }

  private toReadDto(item: ActionItemWithPeople): ActionItemReadEntity {
    return {
      id: item.id,
      title: item.title,
      ...(item.description ? { description: item.description } : {}),
      dueDate: formatActionItemDueDate(item.dueDate),
      ...(item.link ? { link: item.link } : {}),
      status: item.status,
      source: item.source,
      author: {
        id: item.author.id,
        displayName: this.displayName(item.author.user),
      },
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      ...(item.completedAt
        ? { completedAt: item.completedAt.toISOString() }
        : {}),
      ...(item.cancelledAt
        ? { cancelledAt: item.cancelledAt.toISOString() }
        : {}),
      ...(item.cancelledReason
        ? { cancelledReason: item.cancelledReason }
        : {}),
      isOverdue: isActionItemOverdue(item.status, item.dueDate, this.clock),
    };
  }

  private toAuthoredDto(
    item: ActionItemWithPeople,
  ): AuthoredActionItemReadEntity {
    return {
      ...this.toReadDto(item),
      assignee: {
        id: item.assignee.id,
        displayName: this.displayName(item.assignee.user),
      },
    };
  }

  private toContractDto(item: ActionItemWithPeople): ActionItemDto {
    return this.toContractDtoFromRow(item);
  }

  private toContractDtoFromRow(
    item: ActionItemWithPeople | CampaignPersistedActionItem,
  ): ActionItemDto {
    return {
      id: item.id,
      assigneeId: item.assigneeId,
      authorId: item.authorId,
      title: item.title,
      ...(item.description ? { description: item.description } : {}),
      dueDate: formatActionItemDueDate(item.dueDate),
      ...(item.link ? { link: item.link } : {}),
      source: item.source,
      ...(item.campaignId ? { campaignId: item.campaignId } : {}),
      status: item.status,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      ...(item.completedAt
        ? { completedAt: item.completedAt.toISOString() }
        : {}),
      ...(item.cancelledAt
        ? { cancelledAt: item.cancelledAt.toISOString() }
        : {}),
      ...(item.cancelledReason
        ? { cancelledReason: item.cancelledReason }
        : {}),
      isOverdue: isActionItemOverdue(item.status, item.dueDate, this.clock),
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

  private assertCampaignInputUuids(
    input: CreateCampaignActionItemsInput,
  ): void {
    if (!isUUID(input.campaignId)) {
      throw new BadRequestException('campaignId must be a valid UUID');
    }
    if (!isUUID(input.authorId)) {
      throw new BadRequestException('authorId must be a valid UUID');
    }
    for (const assigneeId of input.assigneeIds) {
      if (!isUUID(assigneeId)) {
        throw new BadRequestException('assigneeIds must contain valid UUIDs');
      }
    }
    if (new Set(input.assigneeIds).size !== input.assigneeIds.length) {
      throw new BadRequestException('assigneeIds must not contain duplicates');
    }
  }

  private async runCampaignActivation(
    input: CreateCampaignActionItemsInput,
    normalized: {
      title: string;
      description: string | null;
      dueDate: Date;
      link: string | null;
    },
    writeClient: ActionItemWriteContext,
  ): Promise<ActionItemDto[]> {
    const existingCount = await writeClient.actionItem.count({
      where: { campaignId: input.campaignId },
    });
    if (existingCount > 0) {
      throw new ConflictException('campaign already has action items');
    }

    if (input.assigneeIds.length === 0) {
      return [];
    }

    await this.assertActiveAuthor(input.authorId, writeClient);
    await this.assertActiveAssignees(input.assigneeIds, writeClient);

    const rows = input.assigneeIds.map((assigneeId) => ({
      assigneeId,
      authorId: input.authorId,
      title: normalized.title,
      description: normalized.description,
      dueDate: normalized.dueDate,
      link: normalized.link,
      source: 'campaign' as const,
      campaignId: input.campaignId,
      status: 'open' as const,
    }));

    try {
      await writeClient.actionItem.createMany({ data: rows });
    } catch (error) {
      if (this.isCampaignUniqueViolation(error)) {
        throw new ConflictException('campaign already has action items');
      }
      throw error;
    }

    const created = await writeClient.actionItem.findMany({
      where: { campaignId: input.campaignId },
      orderBy: [
        { dueDate: 'asc' },
        { assigneeId: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    return created.map((item) => this.toContractDtoFromRow(item));
  }

  private async assertActiveAuthor(
    authorId: string,
    writeClient: ActionItemWriteContext,
  ): Promise<void> {
    const author = await writeClient.employee.findFirst({
      where: { id: authorId, employmentStatus: 'active' },
      select: { id: true },
    });
    if (!author) {
      throw new BadRequestException('authorId must be an active employee');
    }
  }

  private async assertActiveAssignees(
    assigneeIds: string[],
    writeClient: ActionItemWriteContext,
  ): Promise<void> {
    const employees = await writeClient.employee.findMany({
      where: {
        id: { in: assigneeIds },
        employmentStatus: 'active',
      },
      select: { id: true },
    });
    const activeIds = new Set(employees.map((employee) => employee.id));
    const invalidAssigneeIds = assigneeIds.filter((id) => !activeIds.has(id));
    if (invalidAssigneeIds.length > 0) {
      throw new BadRequestException({
        message: 'assigneeIds must reference active employees',
        invalidAssigneeIds,
      });
    }
  }

  private isCampaignUniqueViolation(error: unknown): boolean {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return false;
    }
    const target = error.meta?.target;
    if (Array.isArray(target)) {
      return target.includes('campaignId') && target.includes('assigneeId');
    }
    if (typeof target === 'string') {
      return target.includes('campaignId') && target.includes('assigneeId');
    }
    return false;
  }
}
