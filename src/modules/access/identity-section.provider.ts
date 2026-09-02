import { Injectable } from '@nestjs/common';
import {
  AccessRole,
  ResolvedAudience,
} from '../contracts/access-resolver.contract';
import { ActiveMentorLookup } from '../contracts/active-mentor-lookup.contract';
import { PrismaService } from '../../prisma/prisma.service';
import { SectionProvider } from '../contracts/section-provider.contract';
import { RegisterProvider } from '../registry/register-provider.decorator';
import { IdentitySectionDto } from './entities/identity-section.entity';

const MENTOR_VISIBLE_ROLES: ReadonlySet<AccessRole> = new Set([
  'ReportingLine',
  'ProjectLine',
  'PP',
]);

/**
 * S1 identity stub — bootcamp schema exposes User name/email plus manager and
 * people-partner links. Photo, position, and department are deferred until their
 * owning stories add Prisma columns. Mentor is resolved from active
 * `MentorshipPair` rows for D5-allowed audiences only (Story 1.7).
 */
@Injectable()
@RegisterProvider('section', 'S1')
export class IdentitySectionProvider extends SectionProvider {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activeMentorLookup: ActiveMentorLookup,
  ) {
    super();
  }

  async getSection(
    _viewerId: string,
    subjectId: string,
    audience?: ResolvedAudience,
  ): Promise<IdentitySectionDto> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: subjectId },
      include: {
        user: { select: { name: true, email: true } },
        manager: {
          include: { user: { select: { name: true, email: true } } },
        },
        peoplePartner: {
          include: { user: { select: { name: true, email: true } } },
        },
      },
    });

    if (!employee) {
      throw new Error(`Employee ${subjectId} not found`);
    }

    const section: IdentitySectionDto = {
      displayName: employee.user.name?.trim() || employee.user.email,
      manager: employee.manager
        ? {
            id: employee.manager.id,
            displayName: this.relationDisplayName(employee.manager.user),
          }
        : null,
      peoplePartner: employee.peoplePartner
        ? {
            id: employee.peoplePartner.id,
            displayName: this.relationDisplayName(employee.peoplePartner.user),
          }
        : null,
    };

    if (audience && MENTOR_VISIBLE_ROLES.has(audience.role)) {
      try {
        const mentor =
          await this.activeMentorLookup.getActiveMentorForMentee(subjectId);
        if (mentor) {
          section.mentor = mentor;
        }
      } catch {
        // Mentor resolution failures omit mentor only — S1 still returns manager/PP.
      }
    }

    return section;
  }

  private relationDisplayName(user: {
    name: string | null;
    email: string;
  }): string {
    return user.name?.trim() || user.email;
  }
}
