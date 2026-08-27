import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import {
  ActionItemCreation,
  ActionItemDto,
  CreateActionItemInput,
} from '../action-item-creation.contract';

/** Wave-0 stub — creates an in-memory-shaped DTO, does not persist. */
@Injectable()
export class ActionItemCreationStub extends ActionItemCreation {
  createActionItem(input: CreateActionItemInput): Promise<ActionItemDto> {
    return Promise.resolve({
      id: randomUUID(),
      ...input,
      createdAt: new Date().toISOString(),
    });
  }
}
