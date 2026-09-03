/**
 * C6 — ActionItemCreation
 *
 * Owner (real implementation): `action-items` module. `campaigns` calls
 * this directly when a Form Campaign activation generates action items.
 */

export type ActionItemSource = 'manual' | 'campaign';
export type ActionItemStatus = 'open' | 'completed' | 'cancelled';

export interface CreateActionItemInput {
  assigneeId: string;
  authorId: string;
  title: string;
  description?: string;
  dueDate: string;
  link?: string;
  source: ActionItemSource;
  campaignId?: string;
}

export interface ActionItemDto extends CreateActionItemInput {
  id: string;
  status: ActionItemStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export abstract class ActionItemCreation {
  abstract createActionItem(
    input: CreateActionItemInput,
  ): Promise<ActionItemDto>;
}
