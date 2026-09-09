import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  AccessResolver,
  ResolvedAudience,
} from '../contracts/access-resolver.contract';
import { SectionProvider } from '../contracts/section-provider.contract';
import { RegisterProvider } from '../registry/register-provider.decorator';
import { CdsSectionEntity } from './entities/cds-section.entity';
import { CdsService } from './cds.service';

@Injectable()
@RegisterProvider('section', 'S12')
export class CdsSectionProvider extends SectionProvider {
  constructor(
    private readonly cds: CdsService,
    private readonly accessResolver: AccessResolver,
  ) {
    super();
  }

  async getSection(
    viewerEmployeeId: string,
    subjectEmployeeId: string,
    audience?: ResolvedAudience,
  ): Promise<CdsSectionEntity> {
    const resolved =
      audience ??
      (await this.accessResolver.resolveAudience(
        viewerEmployeeId,
        subjectEmployeeId,
      ));
    const accessLevel = resolved.sections.S12;
    if (accessLevel === 'none') {
      throw new ForbiddenException('S12 is not visible to this viewer');
    }

    return this.cds.buildSection(subjectEmployeeId);
  }
}
