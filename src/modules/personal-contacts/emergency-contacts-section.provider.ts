import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  AccessResolver,
  ResolvedAudience,
} from '../contracts/access-resolver.contract';
import { SectionProvider } from '../contracts/section-provider.contract';
import { RegisterProvider } from '../registry/register-provider.decorator';
import { EmergencyContactsSectionEntity } from './entities/personal-contacts.entity';
import { PersonalContactsService } from './personal-contacts.service';

@Injectable()
@RegisterProvider('section', 'S3')
export class EmergencyContactsSectionProvider extends SectionProvider {
  constructor(
    private readonly personalContacts: PersonalContactsService,
    private readonly accessResolver: AccessResolver,
  ) {
    super();
  }

  async getSection(
    viewerEmployeeId: string,
    subjectEmployeeId: string,
    audience?: ResolvedAudience,
  ): Promise<EmergencyContactsSectionEntity> {
    const resolved =
      audience ??
      (await this.accessResolver.resolveAudience(
        viewerEmployeeId,
        subjectEmployeeId,
      ));
    const accessLevel = resolved.sections.S3;
    if (accessLevel === 'none') {
      throw new ForbiddenException('S3 is not visible to this viewer');
    }

    return this.personalContacts.buildEmergencyContactsSection(
      subjectEmployeeId,
    );
  }
}
