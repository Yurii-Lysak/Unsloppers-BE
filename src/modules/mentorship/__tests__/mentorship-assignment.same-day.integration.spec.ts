import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../../app.module';
import { PrismaService } from '../../../prisma/prisma.service';
import { MentorshipAssignmentService } from '../mentorship-assignment.service';

/**
 * Regression coverage for the `timeline_events_active_key` partial unique
 * index (Story 7.2) wrongly blocking a second same-day mentorship pairing —
 * the index enforces "one active system event per employee/type/day", which
 * is correct for the four history-table types but not for 'mentorshipStart'/
 * 'mentorshipEnd', which are per-pair, not per-employee current values.
 * Needs real Postgres: a mocked Prisma client can't exercise the DB-level
 * partial unique index this bug lived in.
 */
describe('MentorshipAssignmentService same-day multiple pairs (real Postgres)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let assignment: MentorshipAssignmentService;
  let createdEmployeeIds: string[] = [];
  let createdUserIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    assignment = app.get(MentorshipAssignmentService);
  });

  afterAll(async () => {
    // Cleanup: this spec's employees have no downstream data other than
    // the mentorship pairs/timeline events the test itself creates.
    await prisma.mentorshipPair.deleteMany({
      where: {
        OR: [
          { mentorId: { in: createdEmployeeIds } },
          { menteeId: { in: createdEmployeeIds } },
        ],
      },
    });
    await prisma.timelineEvent.deleteMany({
      where: { employeeId: { in: createdEmployeeIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
  });

  it('lets a mentor pick up a second mentee on the same calendar day', async () => {
    const emailPrefix = `mentorship-same-day-${Date.now()}`;

    const assignerUser = await prisma.user.create({
      data: { email: `${emailPrefix}-assigner@example.com` },
    });
    const assigner = await prisma.employee.create({
      data: { userId: assignerUser.id },
    });

    const mentorUser = await prisma.user.create({
      data: { email: `${emailPrefix}-mentor@example.com` },
    });
    const mentor = await prisma.employee.create({
      data: { userId: mentorUser.id, openToMentoring: true },
    });

    const menteeAUser = await prisma.user.create({
      data: { email: `${emailPrefix}-mentee-a@example.com` },
    });
    const menteeA = await prisma.employee.create({
      data: { userId: menteeAUser.id, managerId: assigner.id },
    });

    const menteeBUser = await prisma.user.create({
      data: { email: `${emailPrefix}-mentee-b@example.com` },
    });
    const menteeB = await prisma.employee.create({
      data: { userId: menteeBUser.id, managerId: assigner.id },
    });

    createdUserIds = [
      assignerUser.id,
      mentorUser.id,
      menteeAUser.id,
      menteeBUser.id,
    ];
    createdEmployeeIds = [assigner.id, mentor.id, menteeA.id, menteeB.id];

    const firstPair = await assignment.createPair(
      assigner.id,
      mentor.id,
      menteeA.id,
    );
    expect(firstPair.mentorStatus).toBe('mentor');

    const secondPair = await assignment.createPair(
      assigner.id,
      mentor.id,
      menteeB.id,
    );
    expect(secondPair.mentorStatus).toBe('mentor');

    const activePairs = await prisma.mentorshipPair.findMany({
      where: { mentorId: mentor.id, endedAt: null },
    });
    expect(activePairs).toHaveLength(2);

    const mentorTimelineEvents = await prisma.timelineEvent.findMany({
      where: { employeeId: mentor.id, type: 'mentorshipStart' },
    });
    expect(mentorTimelineEvents).toHaveLength(2);
  });
});
