import { Test, TestingModule } from '@nestjs/testing';
import {
  AccessRole,
  ResolvedAudience,
} from '../../contracts/access-resolver.contract';
import { ActiveMentorLookup } from '../../contracts/active-mentor-lookup.contract';
import { PrismaService } from '../../../prisma/prisma.service';
import { IdentitySectionProvider } from '../identity-section.provider';

describe('IdentitySectionProvider', () => {
  let provider: IdentitySectionProvider;
  const prisma = { employee: { findUnique: jest.fn() } };
  const activeMentorLookup = {
    getActiveMentorForMentee: jest.fn(),
  };

  const baseEmployee = {
    id: 'subject-1',
    user: { name: 'Subject User', email: 'subject@example.com' },
    manager: null,
    peoplePartner: null,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    activeMentorLookup.getActiveMentorForMentee.mockResolvedValue({
      id: 'mentor-1',
      displayName: 'Mentor Person',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdentitySectionProvider,
        { provide: PrismaService, useValue: prisma },
        { provide: ActiveMentorLookup, useValue: activeMentorLookup },
      ],
    }).compile();
    provider = module.get(IdentitySectionProvider);
  });

  const audience = (role: AccessRole): ResolvedAudience => ({
    role,
    sections: { S1: role === 'Colleague' ? 'R' : 'RW' },
  });

  it.each<AccessRole>(['Colleague', 'Self', 'SharedLink', 'FullAccess'])(
    'omits mentor for %s viewers (D5 allow-list)',
    async (role) => {
      prisma.employee.findUnique.mockResolvedValue(baseEmployee);

      const section = await provider.getSection(
        'viewer-1',
        'subject-1',
        audience(role),
      );

      expect(section).not.toHaveProperty('mentor');
      expect(
        activeMentorLookup.getActiveMentorForMentee,
      ).not.toHaveBeenCalled();
    },
  );

  it.each<AccessRole>(['ReportingLine', 'ProjectLine', 'PP'])(
    'includes mentor for %s when lookup returns a mentor',
    async (role) => {
      prisma.employee.findUnique.mockResolvedValue(baseEmployee);

      const section = await provider.getSection(
        'viewer-1',
        'subject-1',
        audience(role),
      );

      expect(section.mentor).toEqual({
        id: 'mentor-1',
        displayName: 'Mentor Person',
      });
      expect(activeMentorLookup.getActiveMentorForMentee).toHaveBeenCalledWith(
        'subject-1',
      );
    },
  );

  it('omits mentor when lookup returns null for an allowed audience', async () => {
    prisma.employee.findUnique.mockResolvedValue(baseEmployee);
    activeMentorLookup.getActiveMentorForMentee.mockResolvedValue(null);

    const section = await provider.getSection('viewer-1', 'subject-1', {
      role: 'ReportingLine',
      sections: { S1: 'RW' },
    });

    expect(section).not.toHaveProperty('mentor');
  });

  it('omits mentor when lookup throws but still returns manager and PP', async () => {
    prisma.employee.findUnique.mockResolvedValue({
      ...baseEmployee,
      manager: {
        id: 'manager-1',
        user: { name: 'Manager', email: 'manager@example.com' },
      },
    });
    activeMentorLookup.getActiveMentorForMentee.mockRejectedValue(
      new Error('lookup failed'),
    );

    const section = await provider.getSection('viewer-1', 'subject-1', {
      role: 'ReportingLine',
      sections: { S1: 'RW' },
    });

    expect(section).not.toHaveProperty('mentor');
    expect(section.manager).toEqual({
      id: 'manager-1',
      displayName: 'Manager',
    });
  });

  it('omits mentor when audience is undefined (dev path)', async () => {
    prisma.employee.findUnique.mockResolvedValue(baseEmployee);

    const section = await provider.getSection('viewer-1', 'subject-1');

    expect(section).not.toHaveProperty('mentor');
    expect(activeMentorLookup.getActiveMentorForMentee).not.toHaveBeenCalled();
  });

  it('returns manager and people partner when linked', async () => {
    prisma.employee.findUnique.mockResolvedValue({
      ...baseEmployee,
      manager: {
        id: 'manager-1',
        user: { name: 'Manager', email: 'manager@example.com' },
      },
    });

    const section = await provider.getSection('viewer-1', 'subject-1', {
      role: 'ReportingLine',
      sections: { S1: 'RW' },
    });

    expect(section.manager).toEqual({
      id: 'manager-1',
      displayName: 'Manager',
    });
  });
});
