/**
 * C6 — ActionItemCreation
 *
 * Owner (real implementation): `action-items` module. `campaigns` calls
 * this directly when a Form Campaign activation generates action items.
 */

export type ActionItemSource = 'manual' | 'campaign';

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
  createdAt: string;
}

export abstract class ActionItemCreation {
  abstract createActionItem(
    input: CreateActionItemInput,
  ): Promise<ActionItemDto>;
}
