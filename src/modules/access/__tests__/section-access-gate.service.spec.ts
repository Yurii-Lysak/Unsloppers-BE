import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Clock } from '../../../clock/clock.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AccessResolver } from '../../contracts/access-resolver.contract';
import { ProjectAssignment } from '../../contracts/project-assignment.contract';
import { SectionAccessGate } from '../../contracts/section-access-gate.contract';
import { SectionAccessGateService } from '../section-access-gate.service';

describe('SectionAccessGate', () => {
  let gate: SectionAccessGate;
  const accessResolver = {
    resolveAudience: jest.fn(),
  };
  const prisma = {
    employee: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    projectAssignment: {
      findMany: jest.fn(),
    },
  };
  const projectAssignment = {
    listByEmployee: jest.fn(),
  };
  const clock = {
    now: jest.fn(() => new Date('2026-01-04T12:00:00.000Z')),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.employee.findMany.mockResolvedValue([]);
    prisma.projectAssignment.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: SectionAccessGate, useClass: SectionAccessGateService },
        { provide: AccessResolver, useValue: accessResolver },
        { provide: PrismaService, useValue: prisma },
        { provide: ProjectAssignment, useValue: projectAssignment },
        { provide: Clock, useValue: clock },
      ],
    }).compile();

    gate = module.get(SectionAccessGate);
  });

  it('throws when Colleague viewers request S9', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'Colleague',
      sections: {
        S1: 'R',
        S9: 'none',
        S10: 'R',
        S11: 'R',
      },
    });

    await expect(
      gate.requireSection('viewer-1', 'subject-1', 'S9'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws when Colleague S1 read is below RW minLevel', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'Colleague',
      sections: { S1: 'R' },
    });

    await expect(
      gate.requireSection('viewer-1', 'subject-1', 'S1', 'RW'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('returns S1, S10, and S11 for Colleague audiences', () => {
    expect(
      gate.listGrantedSections({
        role: 'Colleague',
        sections: {
          S1: 'R',
          S2: 'none',
          S3: 'none',
          S4: 'none',
          S5: 'none',
          S6: 'none',
          S7: 'none',
          S8: 'none',
          S9: 'none',
          S10: 'R',
          S11: 'R',
          S12: 'none',
          S13: 'none',
          S14: 'none',
          S15: 'none',
          S16: 'none',
        },
      }),
    ).toEqual(['S1', 'S10', 'S11']);
  });
});
