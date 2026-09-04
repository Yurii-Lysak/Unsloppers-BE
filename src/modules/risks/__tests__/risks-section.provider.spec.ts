import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { deniedMatrixCells } from '../../../../test/support/access-matrix';
import { recordDeniedCoverage } from '../../../../test/support/matrix-coverage-collector';
import { AccessResolver } from '../../contracts/access-resolver.contract';
import { RisksSectionProvider } from '../risks-section.provider';
import { RisksService } from '../risks.service';

describe('RisksSectionProvider', () => {
  let provider: RisksSectionProvider;
  const risks = {
    buildSection: jest.fn(),
  };
  const accessResolver = {
    resolveAudience: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RisksSectionProvider,
        { provide: RisksService, useValue: risks },
        { provide: AccessResolver, useValue: accessResolver },
      ],
    }).compile();

    provider = module.get(RisksSectionProvider);
  });

  it('throws when S6 grant is none', async () => {
    await expect(
      provider.getSection('viewer', 'subject', {
        role: 'Colleague',
        sections: { S6: 'none' } as never,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(deniedMatrixCells().filter((cell) => cell.section === 'S6'))(
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
          sections: { S6: 'none' } as never,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      recordDeniedCoverage({
        kind: 'matrix',
        section: 'S6',
        audience,
      });
    },
  );

  it('delegates RW audience to service', async () => {
    const audience = {
      role: 'ReportingLine',
      sections: { S6: 'RW' },
    } as never;
    risks.buildSection.mockResolvedValue({ records: [], currentLevel: 'low' });

    await provider.getSection('viewer', 'subject', audience);

    expect(risks.buildSection).toHaveBeenCalledWith('subject');
  });
});
