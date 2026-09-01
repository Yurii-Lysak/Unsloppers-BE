import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AccessResolver,
  ResolvedAudience,
  SectionId,
} from '../../contracts/access-resolver.contract';
import { SectionProvider } from '../../contracts/section-provider.contract';
import { ProviderRegistryService } from '../../registry/provider-registry.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ProfileAssemblerService } from '../profile-assembler.service';

const ALL_SECTIONS_NONE: Record<SectionId, 'none'> = {
  S1: 'none',
  S2: 'none',
  S3: 'none',
  S4: 'none',
  S5: 'none',
  S6: 'none',
  S7: 'none',
  S8: 'none',
  S9: 'none',
  S10: 'none',
  S11: 'none',
  S12: 'none',
  S13: 'none',
  S14: 'none',
  S15: 'none',
  S16: 'none',
};

describe('ProfileAssemblerService', () => {
  let service: ProfileAssemblerService;
  const accessResolver = { resolveAudience: jest.fn() };
  const registry = { get: jest.fn() };
  const prisma = { employee: { findUnique: jest.fn() } };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.employee.findUnique.mockResolvedValue({
      id: 'subject-1',
      user: { name: 'Subject User', email: 'subject@example.com' },
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileAssemblerService,
        { provide: AccessResolver, useValue: accessResolver },
        { provide: ProviderRegistryService, useValue: registry },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(ProfileAssemblerService);
  });

  it('omits denied sections for Colleague viewers', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'Colleague',
      sections: {
        ...ALL_SECTIONS_NONE,
        S1: 'R',
        S10: 'R',
        S11: 'R',
      },
    } satisfies ResolvedAudience);

    const s1Provider: SectionProvider = {
      getSection: jest.fn().mockResolvedValue({ displayName: 'Subject User' }),
    };
    const s10Provider: SectionProvider = {
      getSection: jest.fn().mockResolvedValue({
        availability: 'ok',
        leaves: [],
        manageLeaveUrl: null,
      }),
    };
    const s11Provider: SectionProvider = {
      getSection: jest.fn().mockResolvedValue({ projects: [] }),
    };

    registry.get.mockImplementation((_family: string, id: string) => {
      if (id === 'S1') {
        return { status: 'available', provider: s1Provider };
      }
      if (id === 'S10') {
        return { status: 'available', provider: s10Provider };
      }
      if (id === 'S11') {
        return { status: 'available', provider: s11Provider };
      }
      return { status: 'unavailable' };
    });

    const profile = await service.assembleProfile('viewer-1', 'subject-1');

    expect(Object.keys(profile.sections).sort()).toEqual(['S1', 'S10', 'S11']);
    expect(profile.displayName).toBe('Subject User');
    expect(profile.audience.role).toBe('Colleague');
  });

  it('marks unregistered granted sections as unavailable', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'ReportingLine',
      sections: {
        ...ALL_SECTIONS_NONE,
        S1: 'RW',
        S6: 'RW',
      },
    } satisfies ResolvedAudience);

    registry.get.mockImplementation((_family: string, id: string) => {
      if (id === 'S1') {
        return {
          status: 'available',
          provider: {
            getSection: jest
              .fn()
              .mockResolvedValue({ displayName: 'Subject User' }),
          },
        };
      }
      return { status: 'unavailable' };
    });

    const profile = await service.assembleProfile('manager-1', 'subject-1');

    expect(profile.sections.S6).toEqual({
      accessLevel: 'RW',
      status: 'unavailable',
    });
    expect(profile.sections.S1).toMatchObject({
      accessLevel: 'RW',
      data: { displayName: 'Subject User' },
    });
  });

  it('normalizes S10 integration unavailability to section unavailable', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'ReportingLine',
      sections: { ...ALL_SECTIONS_NONE, S10: 'R' },
    } satisfies ResolvedAudience);

    registry.get.mockReturnValue({
      status: 'available',
      provider: {
        getSection: jest.fn().mockResolvedValue({
          availability: 'unavailable',
          leaves: [],
          manageLeaveUrl: null,
        }),
      },
    });

    const profile = await service.assembleProfile('manager-1', 'subject-1');

    expect(profile.sections.S10).toEqual({
      accessLevel: 'R',
      status: 'unavailable',
    });
  });

  it('maps provider throws to unavailable without failing the whole profile', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'ReportingLine',
      sections: { ...ALL_SECTIONS_NONE, S10: 'R', S1: 'RW' },
    } satisfies ResolvedAudience);

    registry.get.mockImplementation((_family: string, id: string) => {
      if (id === 'S1') {
        return {
          status: 'available',
          provider: {
            getSection: jest
              .fn()
              .mockResolvedValue({ displayName: 'Subject User' }),
          },
        };
      }
      if (id === 'S10') {
        return {
          status: 'available',
          provider: {
            getSection: jest.fn().mockRejectedValue(new Error('sync down')),
          },
        };
      }
      return { status: 'unavailable' };
    });

    const profile = await service.assembleProfile('manager-1', 'subject-1');

    expect(profile.sections.S10).toEqual({
      accessLevel: 'R',
      status: 'unavailable',
    });
    expect(profile.sections.S1).toBeDefined();
  });

  it('throws NotFoundException when subject employee is missing', async () => {
    prisma.employee.findUnique.mockResolvedValue(null);

    await expect(
      service.assembleProfile('viewer-1', 'missing-subject'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('marks null provider payloads as unavailable', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'ReportingLine',
      sections: { ...ALL_SECTIONS_NONE, S9: 'RW' },
    } satisfies ResolvedAudience);

    registry.get.mockReturnValue({
      status: 'available',
      provider: {
        getSection: jest.fn().mockResolvedValue(null),
      },
    });

    const profile = await service.assembleProfile('manager-1', 'subject-1');

    expect(profile.sections.S9).toEqual({
      accessLevel: 'RW',
      status: 'unavailable',
    });
  });

  it('marks empty object provider payloads as unavailable', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'ReportingLine',
      sections: { ...ALL_SECTIONS_NONE, S9: 'RW' },
    } satisfies ResolvedAudience);

    registry.get.mockReturnValue({
      status: 'available',
      provider: {
        getSection: jest.fn().mockResolvedValue({}),
      },
    });

    const profile = await service.assembleProfile('manager-1', 'subject-1');

    expect(profile.sections.S9).toEqual({
      accessLevel: 'RW',
      status: 'unavailable',
    });
  });

  it('strips nested availability from successful S10 section data', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'ReportingLine',
      sections: { ...ALL_SECTIONS_NONE, S10: 'R' },
    } satisfies ResolvedAudience);

    registry.get.mockReturnValue({
      status: 'available',
      provider: {
        getSection: jest.fn().mockResolvedValue({
          availability: 'ok',
          leaves: [
            {
              type: 'vacation',
              startDate: '2026-08-25',
              endDate: '2026-08-29',
              approvalState: 'approved',
            },
          ],
          manageLeaveUrl: null,
        }),
      },
    });

    const profile = await service.assembleProfile('manager-1', 'subject-1');

    expect(profile.sections.S10).toMatchObject({
      accessLevel: 'R',
      data: {
        leaves: [
          {
            type: 'vacation',
            startDate: '2026-08-25',
            endDate: '2026-08-29',
            approvalState: 'approved',
          },
        ],
        manageLeaveUrl: null,
      },
    });
    if (profile.sections.S10 && 'data' in profile.sections.S10) {
      expect(profile.sections.S10.data).not.toHaveProperty('availability');
    }
  });

  it('includes unioned section keys from multi-audience C1 resolution', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'PP',
      sections: {
        ...ALL_SECTIONS_NONE,
        S1: 'RW',
        S2: 'RW',
        S6: 'RW',
      },
    } satisfies ResolvedAudience);

    registry.get.mockImplementation((_family: string, id: string) => {
      if (id === 'S1') {
        return {
          status: 'available',
          provider: {
            getSection: jest
              .fn()
              .mockResolvedValue({ displayName: 'Subject User' }),
          },
        };
      }
      return { status: 'unavailable' };
    });

    const profile = await service.assembleProfile('pp-1', 'subject-1');

    expect(Object.keys(profile.sections).sort()).toEqual(['S1', 'S2', 'S6']);
    expect(profile.sections.S2).toEqual({
      accessLevel: 'RW',
      status: 'unavailable',
    });
  });
});
