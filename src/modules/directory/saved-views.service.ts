import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import type {
  FieldFilter,
  SortOrder,
} from '../contracts/field-registry.contract';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSavedViewDto } from './dto/create-saved-view.dto';
import { ShareSavedViewDto } from './dto/share-saved-view.dto';
import { UpdateSavedViewDto } from './dto/update-saved-view.dto';
import {
  SavedViewEntity,
  SavedViewShareRecipientEntity,
} from './entities/saved-view.entity';

type SavedViewWithShares = Prisma.SavedViewGetPayload<{
  include: {
    ownerEmployee: { include: { user: true } };
    shares: {
      include: {
        recipientEmployee: { include: { user: true } };
      };
    };
  };
}>;

@Injectable()
export class SavedViewsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForViewer(viewerEmployeeId: string): Promise<SavedViewEntity[]> {
    const views = await this.prisma.savedView.findMany({
      where: {
        OR: [
          { ownerEmployeeId: viewerEmployeeId },
          {
            shares: {
              some: { recipientEmployeeId: viewerEmployeeId },
            },
          },
        ],
      },
      include: {
        ownerEmployee: { include: { user: true } },
        shares: {
          include: {
            recipientEmployee: { include: { user: true } },
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }],
    });

    return views.map(view => this.toEntity(view, viewerEmployeeId));
  }

  async create(
    viewerEmployeeId: string,
    dto: CreateSavedViewDto,
  ): Promise<SavedViewEntity> {
    const created = await this.prisma.savedView.create({
      data: {
        name: dto.name.trim(),
        ownerEmployeeId: viewerEmployeeId,
        filters: dto.filters as unknown as Prisma.InputJsonValue,
        columnIds: dto.columnIds as unknown as Prisma.InputJsonValue,
        sort: dto.sort ?? null,
        order: dto.order ?? null,
      },
      include: this.viewInclude,
    });

    return this.toEntity(created, viewerEmployeeId);
  }

  async update(
    viewerEmployeeId: string,
    viewId: string,
    dto: UpdateSavedViewDto,
  ): Promise<SavedViewEntity> {
    const existing = await this.findAccessibleView(viewId, viewerEmployeeId);
    this.assertCanEdit(existing, viewerEmployeeId);

    const updated = await this.prisma.savedView.update({
      where: { id: viewId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.filters !== undefined
          ? { filters: dto.filters as unknown as Prisma.InputJsonValue }
          : {}),
        ...(dto.columnIds !== undefined
          ? { columnIds: dto.columnIds as unknown as Prisma.InputJsonValue }
          : {}),
        ...(dto.sort !== undefined ? { sort: dto.sort ?? null } : {}),
        ...(dto.order !== undefined ? { order: dto.order ?? null } : {}),
      },
      include: this.viewInclude,
    });

    return this.toEntity(updated, viewerEmployeeId);
  }

  async remove(viewerEmployeeId: string, viewId: string): Promise<void> {
    const existing = await this.findAccessibleView(viewId, viewerEmployeeId);
    this.assertCanEdit(existing, viewerEmployeeId);

    await this.prisma.savedView.delete({ where: { id: viewId } });
  }

  async replaceShares(
    viewerEmployeeId: string,
    viewId: string,
    dto: ShareSavedViewDto,
  ): Promise<SavedViewEntity> {
    const existing = await this.findAccessibleView(viewId, viewerEmployeeId);
    this.assertCanEdit(existing, viewerEmployeeId);

    const uniqueRecipientIds = [...new Set(dto.recipientEmployeeIds)];
    if (uniqueRecipientIds.includes(viewerEmployeeId)) {
      throw new ForbiddenException('Cannot share a view with yourself');
    }

    await this.assertRecipientsExist(uniqueRecipientIds);

    await this.prisma.$transaction(async tx => {
      await tx.savedViewShare.deleteMany({ where: { savedViewId: viewId } });
      if (uniqueRecipientIds.length > 0) {
        await tx.savedViewShare.createMany({
          data: uniqueRecipientIds.map(recipientEmployeeId => ({
            savedViewId: viewId,
            recipientEmployeeId,
          })),
        });
      }
    });

    const refreshed = await this.prisma.savedView.findUniqueOrThrow({
      where: { id: viewId },
      include: this.viewInclude,
    });

    return this.toEntity(refreshed, viewerEmployeeId);
  }

  private readonly viewInclude = {
    ownerEmployee: { include: { user: true } },
    shares: {
      include: {
        recipientEmployee: { include: { user: true } },
      },
    },
  } as const;

  private async findAccessibleView(
    viewId: string,
    viewerEmployeeId: string,
  ): Promise<SavedViewWithShares> {
    const view = await this.prisma.savedView.findUnique({
      where: { id: viewId },
      include: this.viewInclude,
    });

    if (!view) {
      throw new NotFoundException('Saved view not found');
    }

    const isOwner = view.ownerEmployeeId === viewerEmployeeId;
    const isRecipient = view.shares.some(
      share => share.recipientEmployeeId === viewerEmployeeId,
    );

    if (!isOwner && !isRecipient) {
      throw new NotFoundException('Saved view not found');
    }

    return view;
  }

  private assertCanEdit(
    view: SavedViewWithShares,
    viewerEmployeeId: string,
  ): void {
    if (view.ownerEmployeeId !== viewerEmployeeId) {
      throw new ForbiddenException('Only the view owner can modify this view');
    }
  }

  private async assertRecipientsExist(recipientIds: string[]): Promise<void> {
    const count = await this.prisma.employee.count({
      where: { id: { in: recipientIds } },
    });
    if (count !== recipientIds.length) {
      throw new NotFoundException('One or more recipients were not found');
    }
  }

  private toEntity(
    view: SavedViewWithShares,
    viewerEmployeeId: string,
  ): SavedViewEntity {
    const isOwner = view.ownerEmployeeId === viewerEmployeeId;
    const canEdit = isOwner && view.ownerEmployeeId !== null;

    return {
      id: view.id,
      name: view.name,
      filters: this.parseFilters(view.filters),
      columnIds: this.parseColumnIds(view.columnIds),
      sort: view.sort ?? undefined,
      order: (view.order as SortOrder | null) ?? undefined,
      isOwner,
      canEdit,
      ownerEmployeeId: view.ownerEmployeeId,
      ownerName: view.ownerEmployee?.user.name ?? null,
      sharedWith: view.shares.map(share => this.toShareRecipient(share)),
    };
  }

  private toShareRecipient(
    share: SavedViewWithShares['shares'][number],
  ): SavedViewShareRecipientEntity {
    return {
      employeeId: share.recipientEmployeeId,
      name: share.recipientEmployee.user.name ?? '',
    };
  }

  private parseFilters(value: Prisma.JsonValue): FieldFilter[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value as unknown as FieldFilter[];
  }

  private parseColumnIds(value: Prisma.JsonValue): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((entry): entry is string => typeof entry === 'string');
  }
}
