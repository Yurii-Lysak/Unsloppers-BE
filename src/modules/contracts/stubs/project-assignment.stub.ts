import { Injectable } from '@nestjs/common';
import {
  ProjectAssignment,
  ProjectAssignmentDto,
} from '../project-assignment.contract';

/** Wave-0 stub — no seeded/synced assignments yet. */
@Injectable()
export class ProjectAssignmentStub extends ProjectAssignment {
  listByEmployee(): Promise<ProjectAssignmentDto[]> {
    return Promise.resolve([]);
  }

  listByProject(): Promise<ProjectAssignmentDto[]> {
    return Promise.resolve([]);
  }
}
