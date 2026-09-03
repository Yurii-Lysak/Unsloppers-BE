import { Injectable } from '@nestjs/common';
import type { ActionItem, User } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AccessResolver,
  ResolvedAudience,
} from '../contracts/access-resolver.contract';
import {
  ActionItemCreation,
  ActionItemDto,
  CreateActionItemInput,
} from '../contracts/action-item-creation.contract';
import {
  formatActionItemDueDate,
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
  ) {
    super();
  }

  async createActionItem(input: CreateActionItemInput): Promise<ActionItemDto> {
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
