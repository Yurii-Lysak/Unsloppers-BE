import { Injectable } from '@nestjs/common';
import { ResolvedAudience } from '../contracts/access-resolver.contract';
import { PrismaService } from '../../prisma/prisma.service';
import { SectionProvider } from '../contracts/section-provider.contract';
import { RegisterProvider } from '../registry/register-provider.decorator';
import { IdentitySectionDto } from './entities/identity-section.entity';

/**
 * S1 identity stub — bootcamp schema exposes User name/email plus manager and
 * people-partner links. Photo, position, department, and mentor are deferred
 * until their owning stories add Prisma columns; mentor is omitted for Colleague
 * viewers when present (D5).
 */
@Injectable()
@RegisterProvider('section', 'S1')
export class IdentitySectionProvider extends SectionProvider {
  constructor(private readonly prisma: PrismaService) {
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

    if (audience?.role !== 'Colleague') {
      // Mentor relation deferred until mentorship schema lands (Story 1.7+).
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
