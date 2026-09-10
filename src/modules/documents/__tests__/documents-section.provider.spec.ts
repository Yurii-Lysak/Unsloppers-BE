import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DocumentType } from '../../../generated/prisma/client';
import { AccessResolver } from '../../contracts/access-resolver.contract';
import { DocumentsSectionProvider } from '../documents-section.provider';
import { DocumentsService } from '../documents.service';

describe('DocumentsSectionProvider', () => {
  let provider: DocumentsSectionProvider;

  const documents = {
    buildDocumentsSection: jest.fn(),
  };

  const accessResolver = {
    resolveAudience: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsSectionProvider,
        { provide: DocumentsService, useValue: documents },
        { provide: AccessResolver, useValue: accessResolver },
      ],
    }).compile();

    provider = module.get(DocumentsSectionProvider);
  });

  it('filters ProjectLine S5 list to CV and certificate rows only', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'ProjectLine',
      sections: { S5: 'R' },
    });
    documents.buildDocumentsSection.mockResolvedValue({ documents: [] });

    await provider.getSection('viewer-id', 'subject-id');

    expect(documents.buildDocumentsSection).toHaveBeenCalledWith(
      'subject-id',
      expect.any(Set),
    );
    const firstCall = documents.buildDocumentsSection.mock.calls[0] as
      [string, Set<DocumentType>] | undefined;
    expect(firstCall).toBeDefined();
    expect([...firstCall![1]]).toEqual([
      DocumentType.CV,
      DocumentType.CERTIFICATE,
    ]);
  });

  it('returns all document types for Self viewers', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'Self',
      sections: { S5: 'R' },
    });
    documents.buildDocumentsSection.mockResolvedValue({ documents: [] });

    await provider.getSection('viewer-id', 'subject-id');

    expect(documents.buildDocumentsSection).toHaveBeenCalledWith(
      'subject-id',
      undefined,
    );
  });

  it('throws when S5 is none for the viewer', async () => {
    accessResolver.resolveAudience.mockResolvedValue({
      role: 'Colleague',
      sections: { S5: 'none' },
    });

    await expect(
      provider.getSection('viewer-id', 'subject-id'),
    ).rejects.toThrow(ForbiddenException);
  });
});
