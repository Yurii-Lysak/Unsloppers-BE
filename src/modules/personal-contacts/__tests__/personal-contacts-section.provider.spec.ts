import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { deniedMatrixCells } from '../../../../test/support/access-matrix';
import { recordDeniedCoverage } from '../../../../test/support/matrix-coverage-collector';
import { AccessResolver } from '../../contracts/access-resolver.contract';
import { PersonalContactsSectionProvider } from '../personal-contacts-section.provider';
import { PersonalContactsService } from '../personal-contacts.service';

describe('PersonalContactsSectionProvider', () => {
  let provider: PersonalContactsSectionProvider;
  const personalContacts = {
    buildPersonalContactsSection: jest.fn(),
  };
  const accessResolver = {
    resolveAudience: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PersonalContactsSectionProvider,
        { provide: PersonalContactsService, useValue: personalContacts },
        { provide: AccessResolver, useValue: accessResolver },
      ],
    }).compile();

    provider = module.get(PersonalContactsSectionProvider);
  });

  it('throws when S2 grant is none', async () => {
    await expect(
      provider.getSection('viewer', 'subject', {
        role: 'Colleague',
        sections: { S2: 'none' } as never,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(deniedMatrixCells().filter((cell) => cell.section === 'S2'))(
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
          sections: { S2: 'none' } as never,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      recordDeniedCoverage({
        kind: 'matrix',
        section: 'S2',
        audience,
      });
    },
  );

  it('delegates visible audience to service', async () => {
    personalContacts.buildPersonalContactsSection.mockResolvedValue({
      contactMethods: [],
      residentialAddress: null,
      placeOfStay: null,
    });

    await provider.getSection('viewer', 'subject', {
      role: 'Self',
      sections: { S2: 'RW' },
    } as never);

    expect(personalContacts.buildPersonalContactsSection).toHaveBeenCalledWith(
      'subject',
    );
  });
});
