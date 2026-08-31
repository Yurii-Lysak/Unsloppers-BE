import { Injectable } from '@nestjs/common';
import { FieldRegistry, FieldQueryResultDto } from '../field-registry.contract';

/** Wave-0 stub — no-op writes, empty reads. */
@Injectable()
export class FieldRegistryStub extends FieldRegistry {
  defineField(): Promise<string> {
    return Promise.resolve('00000000-0000-4000-8000-000000000001');
  }

  async setValue(): Promise<void> {
    // no-op — Wave-0 stub
  }

  query(): Promise<FieldQueryResultDto[]> {
    return Promise.resolve([]);
  }
}
