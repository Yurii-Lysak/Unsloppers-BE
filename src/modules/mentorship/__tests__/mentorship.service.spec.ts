import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ActiveMentorLookup } from '../../contracts/active-mentor-lookup.contract';
import { PrismaService } from '../../../prisma/prisma.service';
import { MentorshipService } from '../mentorship.service';

describe('MentorshipService', () => {
  let service: MentorshipService;
  const prisma = {
    employee: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    mentorshipPair: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const activeMentorLookup = {
    getActiveMentorForMentee: jest.fn(),
    getActiveMenteesForMentor: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.mentorshipPair.findMany.mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MentorshipService,
        { provide: PrismaService, useValue: prisma },
        { provide: ActiveMentorLookup, useValue: activeMentorLookup },
      ],
    }).compile();
    service = module.get(MentorshipService);
  });

  it('derives mentor status from active mentor pair', async () => {
    prisma.mentorshipPair.findFirst.mockResolvedValue({ id: 'pair-1' });

    await expect(service.deriveMentorStatus('emp-1', true)).resolves.toBe(
      'mentor',
    );
  });

  it('derives openToMentoring when flag is on and no active pair', async () => {
    prisma.mentorshipPair.findFirst.mockResolvedValue(null);

    await expect(service.deriveMentorStatus('emp-1', true)).resolves.toBe(
      'openToMentoring',
    );
  });

  it('derives none when flag is off and no active pair', async () => {
    prisma.mentorshipPair.findFirst.mockResolvedValue(null);

    await expect(service.deriveMentorStatus('emp-1', false)).resolves.toBe(
      'none',
    );
  });

  it('buildSection loads mentor, mentees, flag, derived status, and history', async () => {
    prisma.employee.findUnique.mockResolvedValue({
      id: 'subject-1',
      openToMentoring: true,
    });
    prisma.mentorshipPair.findFirst
      .mockResolvedValueOnce({ id: 'pair-mentor' })
      .mockResolvedValueOnce(null);
    activeMentorLookup.getActiveMentorForMentee.mockResolvedValue({
      id: 'mentor-1',
      displayName: 'Mentor',
    });
    prisma.mentorshipPair.findMany
      .mockResolvedValueOnce([
        {
          id: 'pair-mentee',
          mentee: {
            id: 'mentee-1',
            user: { name: 'Mentee', email: 'mentee@example.com' },
          },
        },
      ])
      .mockResolvedValueOnce([]);

    await expect(
      service.buildSection('subject-1', 'ReportingLine'),
    ).resolves.toEqual({
      openToMentoring: true,
      mentorStatus: 'openToMentoring',
      mentor: { id: 'mentor-1', displayName: 'Mentor', pairId: 'pair-mentor' },
      mentees: [
        { id: 'mentee-1', displayName: 'Mentee', pairId: 'pair-mentee' },
      ],
      pairHistory: [],
    });
  });

  it('redacts closure feedback for Self audience in pair history', async () => {
    prisma.employee.findUnique.mockResolvedValue({
      id: 'subject-1',
      openToMentoring: true,
    });
    prisma.mentorshipPair.findFirst.mockResolvedValue(null);
    activeMentorLookup.getActiveMentorForMentee.mockResolvedValue(null);
    prisma.mentorshipPair.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'ended-pair',
          mentorId: 'subject-1',
          menteeId: 'mentee-1',
          startedAt: new Date('2026-01-01T00:00:00.000Z'),
          endedAt: new Date('2026-06-01T00:00:00.000Z'),
          closureFeedback: 'Private note',
          mentor: {
            id: 'subject-1',
            user: { name: 'Subject', email: 'subject@example.com' },
          },
          mentee: {
            id: 'mentee-1',
            user: { name: 'Mentee', email: 'mentee@example.com' },
          },
        },
      ]);

    const section = await service.buildSection('subject-1', 'Self');
    expect(section.pairHistory[0]?.closureFeedback).toBeUndefined();
  });

  it('throws when subject employee is missing', async () => {
    prisma.employee.findUnique.mockResolvedValue(null);

    await expect(service.buildSection('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('lists willing mentors with identity-card fields only', async () => {
    prisma.employee.findMany.mockResolvedValue([
      {
        id: 'emp-1',
        user: { name: 'Alice', email: 'alice@example.com' },
      },
    ]);

    await expect(service.listWillingMentors()).resolves.toEqual([
      {
        id: 'emp-1',
        displayName: 'Alice',
        openToMentoring: true,
      },
    ]);
  });
});
