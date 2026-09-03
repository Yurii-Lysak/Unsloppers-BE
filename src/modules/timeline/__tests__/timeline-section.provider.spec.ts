import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { deniedMatrixCells } from '../../../../test/support/access-matrix';
import { recordDeniedCoverage } from '../../../../test/support/matrix-coverage-collector';
import { TimelineService } from '../timeline.service';
import { TimelineSectionProvider } from '../timeline-section.provider';

describe('TimelineSectionProvider', () => {
  let provider: TimelineSectionProvider;
  const timeline = {
    listEvents: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    timeline.listEvents.mockImplementation(
      (
        _viewer: string,
        _subject: string,
        audience?: { sections: { S9?: string } },
      ) => {
        if (audience?.sections.S9 === 'none') {
          return Promise.reject(
            new ForbiddenException('Career timeline is not accessible'),
          );
        }
        return Promise.resolve([]);
      },
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimelineSectionProvider,
        { provide: TimelineService, useValue: timeline },
      ],
    }).compile();

    provider = module.get(TimelineSectionProvider);
  });

  const s9Denied = deniedMatrixCells().filter((cell) => cell.section === 'S9');
  expect(s9Denied.length).toBeGreaterThan(0);

  it.each(s9Denied)(
    'propagates S9 none grant as ForbiddenException ($audience)',
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
          sections: { S9: 'none' } as never,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(timeline.listEvents).toHaveBeenCalledWith(
        'viewer',
        'subject',
        expect.objectContaining({ sections: { S9: 'none' } }),
      );

      recordDeniedCoverage({
        kind: 'matrix',
        section: 'S9',
        audience,
      });
    },
  );

  it('returns events when S9 is granted', async () => {
    timeline.listEvents.mockResolvedValue([{ id: 'evt-1' }]);

    await expect(
      provider.getSection('viewer', 'subject', {
        role: 'ReportingLine',
        sections: { S9: 'RW' } as never,
      }),
    ).resolves.toEqual({ events: [{ id: 'evt-1' }] });
  });
});
