import { ForbiddenException, Injectable } from '@nestjs/common';
import { DocumentType } from '../../generated/prisma/client';
import {
  AccessResolver,
  AccessRole,
  ResolvedAudience,
} from '../contracts/access-resolver.contract';
import { SectionProvider } from '../contracts/section-provider.contract';
import { RegisterProvider } from '../registry/register-provider.decorator';
import { PROJECT_LINE_VISIBLE_DOCUMENT_TYPES } from './documents.constants';
import { DocumentsSectionEntity } from './entities/document.entity';
import { DocumentsService } from './documents.service';

@Injectable()
@RegisterProvider('section', 'S5')
export class DocumentsSectionProvider extends SectionProvider {
  constructor(
    private readonly documents: DocumentsService,
    private readonly accessResolver: AccessResolver,
  ) {
    super();
  }

  async getSection(
    viewerEmployeeId: string,
    subjectEmployeeId: string,
    audience?: ResolvedAudience,
  ): Promise<DocumentsSectionEntity> {
    const resolved =
      audience ??
      (await this.accessResolver.resolveAudience(
        viewerEmployeeId,
        subjectEmployeeId,
      ));
    const accessLevel = resolved.sections.S5;
    if (accessLevel === 'none') {
      throw new ForbiddenException('S5 is not visible to this viewer');
    }

    const allowedTypes = this.resolveAllowedTypes(resolved.role);
    const section = await this.documents.buildDocumentsSection(
      subjectEmployeeId,
      allowedTypes,
    );

    return section;
  }

  private resolveAllowedTypes(
    role: AccessRole,
  ): ReadonlySet<DocumentType> | undefined {
    if (role === 'ProjectLine') {
      return PROJECT_LINE_VISIBLE_DOCUMENT_TYPES;
    }
    return undefined;
  }
}
