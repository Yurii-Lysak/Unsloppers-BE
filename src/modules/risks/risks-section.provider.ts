import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  AccessResolver,
  ResolvedAudience,
} from '../contracts/access-resolver.contract';
import { SectionProvider } from '../contracts/section-provider.contract';
import { RegisterProvider } from '../registry/register-provider.decorator';
import { RisksSectionEntity } from './entities/risk-record.entity';
import { RisksService } from './risks.service';

@Injectable()
@RegisterProvider('section', 'S6')
export class RisksSectionProvider extends SectionProvider {
  constructor(
    private readonly risks: RisksService,
    private readonly accessResolver: AccessResolver,
  ) {
    super();
  }

  async getSection(
    viewerEmployeeId: string,
    subjectEmployeeId: string,
    audience?: ResolvedAudience,
  ): Promise<RisksSectionEntity> {
    const resolved =
      audience ??
      (await this.accessResolver.resolveAudience(
        viewerEmployeeId,
        subjectEmployeeId,
      ));
    const accessLevel = resolved.sections.S6;
    if (accessLevel === 'none') {
      throw new ForbiddenException('S6 is not visible to this viewer');
    }

    return this.risks.buildSection(subjectEmployeeId);
  }
}
