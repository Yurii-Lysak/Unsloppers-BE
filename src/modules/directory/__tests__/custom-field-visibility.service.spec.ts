import { Test, TestingModule } from '@nestjs/testing';
import { AccessResolver } from '../../contracts/access-resolver.contract';
import { CustomFieldVisibilityService } from '../custom-field-visibility.service';

describe('CustomFieldVisibilityService', () => {
  let service: CustomFieldVisibilityService;
  const accessResolver = {
    resolveAudience: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomFieldVisibilityService,
        { provide: AccessResolver, useValue: accessResolver },
      ],
    }).compile();

    service = module.get(CustomFieldVisibilityService);
  });

  it('hides management fields from colleagues even when S16 is readable', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'Colleague',
      sections: { S16: 'R' },
    });

    await expect(
      service.canViewFieldForSubject('viewer-1', 'subject-1', 'management'),
    ).resolves.toBe(false);
  });

  it('shows colleague-visible fields to colleagues when S16 grants read', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'Colleague',
      sections: { S16: 'R' },
    });

    await expect(
      service.canViewFieldForSubject('viewer-1', 'subject-1', 'colleague'),
    ).resolves.toBe(true);
  });

  it('requires S16 RW for writes', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'ReportingLine',
      sections: { S16: 'R' },
    });

    await expect(
      service.canWriteFieldForSubject('viewer-1', 'subject-1', 'management'),
    ).resolves.toBe(false);
  });
});
