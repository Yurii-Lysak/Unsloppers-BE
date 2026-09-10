import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { deniedMatrixCells } from '../../../../test/support/access-matrix';
import { recordDeniedCoverage } from '../../../../test/support/matrix-coverage-collector';
import { AccessResolver } from '../../contracts/access-resolver.contract';
import { EmergencyContactsSectionProvider } from '../emergency-contacts-section.provider';
import { PersonalContactsService } from '../personal-contacts.service';

describe('EmergencyContactsSectionProvider', () => {
  let provider: EmergencyContactsSectionProvider;
  const personalContacts = {
    buildEmergencyContactsSection: jest.fn(),
  };
  const accessResolver = {
    resolveAudience: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmergencyContactsSectionProvider,
        { provide: PersonalContactsService, useValue: personalContacts },
        { provide: AccessResolver, useValue: accessResolver },
      ],
    }).compile();

    provider = module.get(EmergencyContactsSectionProvider);
  });

  it('throws when S3 grant is none', async () => {
    await expect(
      provider.getSection('viewer', 'subject', {
        role: 'Colleague',
        sections: { S3: 'none' } as never,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(deniedMatrixCells().filter((cell) => cell.section === 'S3'))(
    'throws for denied matrix audience $audience',
    async ({ audience }) => {
      const role =
        audience === 'colleague'
          ? 'Colleague'
          : audience === 'sharedLink'
            ? 'SharedLink'
            : 'Self';

      await expect(
        provider.getSection('viewer', 'subject', {
          role,
          sections: { S3: 'none' } as never,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      recordDeniedCoverage({
        kind: 'matrix',
        section: 'S3',
        audience,
      });
    },
  );

  it('delegates visible audience to service', async () => {
    personalContacts.buildEmergencyContactsSection.mockResolvedValue({
      contacts: [],
    });

    await provider.getSection('viewer', 'subject', {
      role: 'Self',
      sections: { S3: 'RW' },
    } as never);

    expect(personalContacts.buildEmergencyContactsSection).toHaveBeenCalledWith(
      'subject',
    );
  });
});
