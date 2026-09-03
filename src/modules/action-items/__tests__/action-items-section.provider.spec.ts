import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { deniedMatrixCells } from '../../../../test/support/access-matrix';
import { recordDeniedCoverage } from '../../../../test/support/matrix-coverage-collector';
import { AccessResolver } from '../../contracts/access-resolver.contract';
import { ActionItemsSectionProvider } from '../action-items-section.provider';
import { ActionItemsService } from '../action-items.service';

describe('ActionItemsSectionProvider', () => {
  let provider: ActionItemsSectionProvider;

  const actionItems = {
    buildSection: jest.fn(),
  };

  const accessResolver = {
    resolveAudience: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActionItemsSectionProvider,
        { provide: ActionItemsService, useValue: actionItems },
        { provide: AccessResolver, useValue: accessResolver },
      ],
    }).compile();

    provider = module.get(ActionItemsSectionProvider);
  });

  it('delegates RW audience to service with resolved audience', async () => {
    const audience = {
      role: 'ReportingLine' as const,
      sections: { S14: 'RW' as const },
    };

    accessResolver.resolveAudience.mockResolvedValue(audience);
    actionItems.buildSection.mockResolvedValue({ items: [] });

    await expect(provider.getSection('viewer-1', 'subject-1')).resolves.toEqual(
      { items: [] },
    );

    expect(actionItems.buildSection).toHaveBeenCalledWith(
      'subject-1',
      audience,
    );
  });

  it('throws when S14 is none', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'Colleague' as const,
      sections: { S14: 'none' as const },
    });

    await expect(
      provider.getSection('viewer-1', 'subject-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns terminal fields from the service mapping', async () => {
    const audience = {
      role: 'Self' as const,
      sections: { S14: 'R' as const },
    };
    accessResolver.resolveAudience.mockResolvedValue(audience);
    actionItems.buildSection.mockResolvedValue({
      items: [
        {
          id: 'item-1',
          title: 'Done',
          dueDate: '2026-09-15',
          status: 'cancelled',
          source: 'manual',
          author: { id: 'author-1', displayName: 'Author' },
          createdAt: '2026-09-01T12:00:00.000Z',
          updatedAt: '2026-09-03T12:00:00.000Z',
          cancelledAt: '2026-09-03T12:00:00.000Z',
          cancelledReason: 'Superseded',
        },
      ],
    });

    await expect(provider.getSection('viewer-1', 'subject-1')).resolves.toEqual(
      {
        items: [
          expect.objectContaining({
            status: 'cancelled',
            cancelledAt: '2026-09-03T12:00:00.000Z',
            cancelledReason: 'Superseded',
          }),
        ],
      },
    );
  });

  it.each(deniedMatrixCells().filter((cell) => cell.section === 'S14'))(
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
          sections: { S14: 'none' } as never,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      recordDeniedCoverage({
        kind: 'matrix',
        section: 'S14',
        audience,
      });
    },
  );
});
