import { Injectable } from '@nestjs/common';
import { BUILTIN_FIELD_IDS } from '../contracts/field-registry.contract';
import { FieldProvider } from '../contracts/field-provider.contract';
import type { FieldQueryResultDto } from '../contracts/field-registry.contract';
import { RegisterProvider } from '../registry/register-provider.decorator';
import { CdsService } from './cds.service';

@Injectable()
@RegisterProvider('field', BUILTIN_FIELD_IDS.has_open_idp)
export class OpenIdpFieldProvider extends FieldProvider {
  constructor(private readonly cds: CdsService) {
    super();
  }

  async queryValues(employeeIds: string[]): Promise<FieldQueryResultDto[]> {
    if (employeeIds.length === 0) {
      return [];
    }

    const openEmployeeIds = new Set(
      await this.cds.getOpenIdpEmployeeIds(employeeIds),
    );
    return employeeIds.map((employeeId) => ({
      employeeId,
      fieldId: BUILTIN_FIELD_IDS.has_open_idp,
      value: openEmployeeIds.has(employeeId),
    }));
  }
}
