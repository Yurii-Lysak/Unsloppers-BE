import { Test, TestingModule } from '@nestjs/testing';
import { AccessResolver } from '../../contracts/access-resolver.contract';
import { PrismaService } from '../../../prisma/prisma.service';
import { CustomFieldVisibilityService } from '../custom-field-visibility.service';

describe('CustomFieldVisibilityService', () => {
  let service: CustomFieldVisibilityService;
  const accessResolver = {
    resolveAudience: jest.fn(),
  };
  const prisma = {
    employee: {
      findFirst: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.employee.findFirst.mockResolvedValue({ id: 'peer-1' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomFieldVisibilityService,
        { provide: AccessResolver, useValue: accessResolver },
        { provide: PrismaService, useValue: prisma },
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

  it('hides colleague-visible fields when production Colleague S16 is none', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'Colleague',
      sections: { S16: 'none' },
    });

    await expect(
      service.canViewFieldForSubject('viewer-1', 'subject-1', 'colleague'),
    ).resolves.toBe(false);
  });

  it('shows colleague-visible fields when S16 grants read (Story 1.10 target)', async () => {
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

  it('blocks definition listing when peer catalog resolves Colleague S16 none', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'Colleague',
      sections: { S16: 'none' },
    });

    await expect(
      service.canViewFieldDefinition('viewer-1', 'colleague'),
    ).resolves.toBe(false);
  });

  it('hides employee-tier definitions from Colleague-only viewers in directory lists', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'Colleague',
      sections: { S16: 'none' },
    });

    await expect(
      service.canViewFieldDefinition('viewer-1', 'employee'),
    ).resolves.toBe(false);
    await expect(
      service.canViewFieldDefinition('viewer-1', 'colleague'),
    ).resolves.toBe(false);
  });

  it('shows management-tier definitions to ReportingLine viewers in catalog', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'ReportingLine',
      sections: { S16: 'RW' },
    });

    await expect(
      service.canViewFieldDefinition('viewer-1', 'management'),
    ).resolves.toBe(true);
  });

  it('prefers a direct report when resolving catalog audience', async () => {
    prisma.employee.findFirst.mockResolvedValueOnce({ id: 'report-1' });
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'ReportingLine',
      sections: { S16: 'RW' },
    });

    await expect(
      service.canViewFieldDefinition('viewer-1', 'management'),
    ).resolves.toBe(true);
    expect(prisma.employee.findFirst).toHaveBeenCalledWith({
      where: { managerId: 'viewer-1' },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    expect(accessResolver.resolveAudience).toHaveBeenCalledWith(
      'viewer-1',
      'report-1',
    );
  });

  it('shows employee-tier field values to Self on own profile', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'Self',
      sections: { S16: 'R' },
    });

    await expect(
      service.canViewFieldForSubject('viewer-1', 'viewer-1', 'employee'),
    ).resolves.toBe(true);
  });
});
