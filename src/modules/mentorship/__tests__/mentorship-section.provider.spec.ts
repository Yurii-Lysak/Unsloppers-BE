import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { deniedMatrixCells } from '../../../../test/support/access-matrix';
import { recordDeniedCoverage } from '../../../../test/support/matrix-coverage-collector';
import { AccessResolver } from '../../contracts/access-resolver.contract';
import { MentorshipSectionProvider } from '../mentorship-section.provider';
import { MentorshipService } from '../mentorship.service';

describe('MentorshipSectionProvider', () => {
  let provider: MentorshipSectionProvider;
  const mentorship = {
    buildSection: jest.fn(),
  };
  const accessResolver = {
    resolveAudience: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MentorshipSectionProvider,
        { provide: MentorshipService, useValue: mentorship },
        { provide: AccessResolver, useValue: accessResolver },
      ],
    }).compile();

    provider = module.get(MentorshipSectionProvider);
  });

  it('throws when S13 grant is none', async () => {
    await expect(
      provider.getSection('viewer', 'subject', {
        role: 'Colleague',
        sections: { S13: 'none' } as never,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(deniedMatrixCells().filter((cell) => cell.section === 'S13'))(
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
          sections: { S13: 'none' } as never,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      recordDeniedCoverage({
        kind: 'matrix',
        section: 'S13',
        audience,
      });
    },
  );

  it('delegates RW audience to service with RW access level', async () => {
    const audience = {
      role: 'Self',
      sections: { S13: 'RW' },
    } as never;
    mentorship.buildSection.mockResolvedValue({
      openToMentoring: false,
      mentorStatus: 'none',
      mentees: [],
    });

    await provider.getSection('viewer', 'subject', audience);

    expect(mentorship.buildSection).toHaveBeenCalledWith('subject', 'Self');
  });
});
