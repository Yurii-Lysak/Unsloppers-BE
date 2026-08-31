import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Internal write path for `Employee.peoplePartnerId` (Story 1.3). Not C9
 * `OrgRelationshipWriter` — no permission checks, journaling, or self-assignment
 * guards until that contract lands.
 */
@Injectable()
export class PeoplePartnerAssignmentService {
  constructor(private readonly prisma: PrismaService) {}

  async assign(
    subjectId: string,
    peoplePartnerId: string | null,
  ): Promise<{ subjectId: string; peoplePartnerId: string | null }> {
    const row = await this.prisma.employee.update({
      where: { id: subjectId },
      data: { peoplePartnerId },
      select: { id: true, peoplePartnerId: true },
    });
    return { subjectId: row.id, peoplePartnerId: row.peoplePartnerId };
  }
}
