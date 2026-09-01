import { Test, TestingModule } from '@nestjs/testing';
import { ResolvedAudience } from '../../contracts/access-resolver.contract';
import { PrismaService } from '../../../prisma/prisma.service';
import { IdentitySectionProvider } from '../identity-section.provider';

describe('IdentitySectionProvider', () => {
  let provider: IdentitySectionProvider;
  const prisma = { employee: { findUnique: jest.fn() } };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdentitySectionProvider,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    provider = module.get(IdentitySectionProvider);
  });

  it('omits mentor for Colleague viewers (D5)', async () => {
    prisma.employee.findUnique.mockResolvedValue({
      id: 'subject-1',
      user: { name: 'Subject User', email: 'subject@example.com' },
      manager: null,
      peoplePartner: null,
    });

    const audience: ResolvedAudience = {
      role: 'Colleague',
      sections: { S1: 'R' },
    };

    const section = await provider.getSection(
      'viewer-1',
      'subject-1',
      audience,
    );

    expect(section).not.toHaveProperty('mentor');
    expect(section.displayName).toBe('Subject User');
  });

  it('returns manager and people partner when linked', async () => {
    prisma.employee.findUnique.mockResolvedValue({
      id: 'subject-1',
      user: { name: 'Subject User', email: 'subject@example.com' },
      manager: {
        id: 'manager-1',
        user: { name: 'Manager', email: 'manager@example.com' },
      },
      peoplePartner: null,
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
