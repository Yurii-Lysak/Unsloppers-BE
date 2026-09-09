import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { deniedMatrixCells } from '../../../../test/support/access-matrix';
import { recordDeniedCoverage } from '../../../../test/support/matrix-coverage-collector';
import { AccessResolver } from '../../contracts/access-resolver.contract';
import { RequestHistorySectionProvider } from '../request-history-section.provider';
import { ResourcingService } from '../resourcing.service';

describe('RequestHistorySectionProvider', () => {
  let provider: RequestHistorySectionProvider;
  const resourcing = {
    buildRequestHistorySection: jest.fn(),
  };
  const accessResolver = {
    resolveAudience: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequestHistorySectionProvider,
        { provide: ResourcingService, useValue: resourcing },
        { provide: AccessResolver, useValue: accessResolver },
      ],
    }).compile();

    provider = module.get(RequestHistorySectionProvider);
  });

  it('throws when S15 grant is none', async () => {
    await expect(
      provider.getSection('viewer', 'subject', {
        role: 'Colleague',
        sections: { S15: 'none' } as never,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws when S15 grant is missing from the audience object', async () => {
    await expect(
      provider.getSection('viewer', 'subject', {
        role: 'ReportingLine',
        sections: {} as never,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(deniedMatrixCells().filter((cell) => cell.section === 'S15'))(
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
          sections: { S15: 'none' } as never,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      recordDeniedCoverage({
        kind: 'matrix',
        section: 'S15',
        audience,
      });
    },
  );

  it('delegates R audience to service', async () => {
    const audience = {
      role: 'ReportingLine',
      sections: { S15: 'R' },
    } as never;
    resourcing.buildRequestHistorySection.mockResolvedValue({ entries: [] });

    await provider.getSection('viewer', 'subject', audience);

    expect(resourcing.buildRequestHistorySection).toHaveBeenCalledWith(
      'subject',
    );
  });
});
