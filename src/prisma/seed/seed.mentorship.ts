import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { BootcampIdentity } from './seed.manifest';

/**
 * Story 1.7 — one deterministic active mentorship pair so demo profiles can
 * show a mentor in the header after `db:seed` without manual DB edits.
 */
export async function seedDemoMentorshipPair(
  prisma: PrismaService,
  identities: BootcampIdentity[],
  logger: Logger,
): Promise<number> {
  if (identities.length < 2) {
    return 0;
  }

  const [menteeIdentity, mentorIdentity] = [identities[0], identities[1]];
  const menteeEmployee = await prisma.employee.findFirst({
    where: { user: { email: menteeIdentity.email } },
    select: { id: true },
  });
  const mentorEmployee = await prisma.employee.findFirst({
    where: { user: { email: mentorIdentity.email } },
    select: { id: true },
  });

  const menteeId = menteeEmployee?.id;
  const mentorId = mentorEmployee?.id;
  if (!menteeId || !mentorId || menteeId === mentorId) {
    return 0;
  }

  const existing = await prisma.mentorshipPair.findFirst({
    where: { menteeId, endedAt: null },
    select: { id: true },
  });
  if (existing) {
    return 0;
  }

  await prisma.mentorshipPair.create({
    data: { mentorId, menteeId },
  });
  logger.log(
    `Seeded demo mentorship pair: ${mentorIdentity.email} mentors ${menteeIdentity.email}.`,
  );
  return 1;
}
