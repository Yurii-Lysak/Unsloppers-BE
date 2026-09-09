import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { deniedMatrixCells } from '../../../../test/support/access-matrix';
import { recordDeniedCoverage } from '../../../../test/support/matrix-coverage-collector';
import { AccessResolver } from '../../contracts/access-resolver.contract';
import { CdsSectionProvider } from '../cds-section.provider';
import { CdsService } from '../cds.service';

describe('CdsSectionProvider', () => {
  let provider: CdsSectionProvider;
  const cds = {
    buildSection: jest.fn(),
  };
  const accessResolver = {
    resolveAudience: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CdsSectionProvider,
        { provide: CdsService, useValue: cds },
        { provide: AccessResolver, useValue: accessResolver },
      ],
    }).compile();

    provider = module.get(CdsSectionProvider);
  });

  it('throws when S12 grant is none', async () => {
    await expect(
      provider.getSection('viewer', 'subject', {
        role: 'Colleague',
        sections: { S12: 'none' } as never,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(deniedMatrixCells().filter((cell) => cell.section === 'S12'))(
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
          sections: { S12: 'none' } as never,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      recordDeniedCoverage({
        kind: 'matrix',
        section: 'S12',
        audience,
      });
    },
  );

  it('delegates RW audience to service', async () => {
    const audience = {
      role: 'ReportingLine',
      sections: { S12: 'RW' },
    } as never;
    cds.buildSection.mockResolvedValue({
      matrixLink: null,
      assessments: [],
      idpRecords: [],
    });

    await provider.getSection('viewer', 'subject', audience);

    expect(cds.buildSection).toHaveBeenCalledWith('subject');
  });

  it('delegates Self read-only audience to service', async () => {
    const audience = {
      role: 'Self',
      sections: { S12: 'R' },
    } as never;
    cds.buildSection.mockResolvedValue({
      matrixLink: null,
      assessments: [],
      idpRecords: [],
    });

    await provider.getSection('viewer', 'subject', audience);

    expect(cds.buildSection).toHaveBeenCalledWith('subject');
  });

  it('delegates PP audience to service', async () => {
    const audience = {
      role: 'PP',
      sections: { S12: 'RW' },
    } as never;
    cds.buildSection.mockResolvedValue({
      matrixLink: null,
      assessments: [],
      idpRecords: [],
    });

    await provider.getSection('viewer', 'subject', audience);

    expect(cds.buildSection).toHaveBeenCalledWith('subject');
  });
});
