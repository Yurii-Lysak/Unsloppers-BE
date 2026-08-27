import { Injectable } from '@nestjs/common';
import {
  ExternalIdentityMapping,
  ExternalIdentityMappingDto,
} from '../external-identity-mapping.contract';

/** Wave-0 stub — no mappings yet, `integrations` not wired up. */
@Injectable()
export class ExternalIdentityMappingStub extends ExternalIdentityMapping {
  findByExternalId(): Promise<ExternalIdentityMappingDto | null> {
    return Promise.resolve(null);
  }

  listByEmployee(): Promise<ExternalIdentityMappingDto[]> {
    return Promise.resolve([]);
  }
}
