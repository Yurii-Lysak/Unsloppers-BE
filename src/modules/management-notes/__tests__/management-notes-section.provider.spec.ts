import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { deniedMatrixCells } from '../../../../test/support/access-matrix';
import { recordDeniedCoverage } from '../../../../test/support/matrix-coverage-collector';
import { AccessResolver } from '../../contracts/access-resolver.contract';
import { PrismaService } from '../../../prisma/prisma.service';
import { ManagementNotesService } from '../management-notes.service';
import { ManagementNotesSectionProvider } from '../management-notes-section.provider';

describe('ManagementNotesSectionProvider', () => {
  let provider: ManagementNotesSectionProvider;
  const managementNotes = {
    buildSection: jest.fn(),
  };
  const accessResolver = {
    resolveAudience: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ManagementNotesSectionProvider,
        { provide: ManagementNotesService, useValue: managementNotes },
        { provide: AccessResolver, useValue: accessResolver },
      ],
    }).compile();

    provider = module.get(ManagementNotesSectionProvider);
  });

  it('throws when S7 grant is none', async () => {
    await expect(
      provider.getSection('viewer', 'subject', {
        role: 'Colleague',
        sections: { S7: 'none' } as never,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(deniedMatrixCells().filter((cell) => cell.section === 'S7'))(
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
          sections: { S7: 'none' } as never,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      recordDeniedCoverage({
        kind: 'matrix',
        section: 'S7',
        audience,
      });
    },
  );

  it('delegates RW audience to service with RW access level', async () => {
    const audience = {
      role: 'ReportingLine',
      sections: { S7: 'RW' },
    } as never;
    managementNotes.buildSection.mockResolvedValue({ notes: [] });

    await provider.getSection('viewer', 'subject', audience);

    expect(managementNotes.buildSection).toHaveBeenCalledWith(
      'subject',
      audience,
      'RW',
    );
  });
});

describe('ManagementNotesService section filtering', () => {
  let service: ManagementNotesService;
  const prisma = {
    managementNote: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  const baseNote = {
    id: 'note-1',
    subjectEmployeeId: 'subject',
    authorEmployeeId: 'author',
    content: 'Private note',
    visibleForEmployee: false,
    visibleForPm: false,
    createdAt: new Date('2026-01-02T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    authorEmployee: {
      id: 'author',
      user: { name: 'Author Name', email: 'author@example.com' },
    },
  };

  const flaggedPmNote = {
    ...baseNote,
    id: 'note-2',
    content: 'PM note',
    visibleForPm: true,
  };

  const flaggedEmployeeNote = {
    ...baseNote,
    id: 'note-3',
    content: 'Employee note',
    visibleForEmployee: true,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ManagementNotesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(ManagementNotesService);
  });

  it('returns all notes with flags for RW viewers', async () => {
    prisma.managementNote.findMany.mockResolvedValue([baseNote, flaggedPmNote]);

    const result = await service.buildSection(
      'subject',
      { role: 'PP', sections: { S7: 'RW' } } as never,
      'RW',
    );

    expect(result.notes).toHaveLength(2);
    expect(result.notes[0]).toMatchObject({
      visibleForEmployee: false,
      visibleForPm: false,
    });
    expect(result.hasHiddenNotes).toBeUndefined();
  });

  it('filters Self to employee-flagged notes without visibility fields', async () => {
    prisma.managementNote.findMany.mockResolvedValue([
      baseNote,
      flaggedEmployeeNote,
    ]);

    const result = await service.buildSection(
      'subject',
      { role: 'Self', sections: { S7: 'R' } } as never,
      'R',
    );

    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]).toEqual({
      id: 'note-3',
      content: 'Employee note',
      author: { id: 'author', displayName: 'Author Name' },
      createdAt: flaggedEmployeeNote.createdAt.toISOString(),
      updatedAt: flaggedEmployeeNote.updatedAt.toISOString(),
    });
    expect(result.notes[0]).not.toHaveProperty('visibleForEmployee');
  });

  it('filters PM to visible-for-PM notes and sets hasHiddenNotes', async () => {
    prisma.managementNote.findMany.mockResolvedValue([baseNote, flaggedPmNote]);

    const result = await service.buildSection(
      'subject',
      { role: 'ProjectLine', sections: { S7: 'R' } } as never,
      'R',
    );

    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]).toMatchObject({ id: 'note-2', content: 'PM note' });
    expect(result.hasHiddenNotes).toBe(true);
  });

  it('sets hasHiddenNotes false when subject has no notes', async () => {
    prisma.managementNote.findMany.mockResolvedValue([]);

    const result = await service.buildSection(
      'subject',
      { role: 'ProjectLine', sections: { S7: 'R' } } as never,
      'R',
    );

    expect(result.notes).toEqual([]);
    expect(result.hasHiddenNotes).toBe(false);
  });

  it('sets hasHiddenNotes true for PM when only hidden notes exist', async () => {
    prisma.managementNote.findMany.mockResolvedValue([baseNote]);

    const result = await service.buildSection(
      'subject',
      { role: 'ProjectLine', sections: { S7: 'R' } } as never,
      'R',
    );

    expect(result.notes).toEqual([]);
    expect(result.hasHiddenNotes).toBe(true);
  });

  it('uses Unknown author when author user has no name or email', async () => {
    prisma.managementNote.findMany.mockResolvedValue([
      {
        ...baseNote,
        authorEmployee: {
          id: 'author',
          user: { name: null, email: '' },
        },
      },
    ]);

    const result = await service.buildSection(
      'subject',
      { role: 'PP', sections: { S7: 'RW' } } as never,
      'RW',
    );

    expect(result.notes[0]).toMatchObject({
      author: { displayName: 'Unknown author' },
    });
  });

  it('throws for unsupported read-only audiences', async () => {
    prisma.managementNote.findMany.mockResolvedValue([baseNote]);

    await expect(
      service.buildSection(
        'subject',
        { role: 'Colleague', sections: { S7: 'R' } } as never,
        'R',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('ManagementNotesService mutations', () => {
  let service: ManagementNotesService;
  const prisma = {
    managementNote: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  const baseNote = {
    id: 'note-1',
    subjectEmployeeId: 'subject',
    authorEmployeeId: 'author',
    content: 'Private note',
    visibleForEmployee: false,
    visibleForPm: false,
    createdAt: new Date('2026-01-02T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    authorEmployee: {
      id: 'author',
      user: { name: 'Author Name', email: 'author@example.com' },
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ManagementNotesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(ManagementNotesService);
  });

  it('creates a note with default visibility flags', async () => {
    prisma.managementNote.create.mockResolvedValue(baseNote);

    const result = await service.createNote('subject', 'author', {
      content: 'New note',
    });

    expect(prisma.managementNote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          subjectEmployeeId: 'subject',
          authorEmployeeId: 'author',
          content: 'New note',
          visibleForEmployee: false,
          visibleForPm: false,
        },
      }),
    );
    expect(result).toMatchObject({
      content: 'Private note',
      visibleForEmployee: false,
      visibleForPm: false,
    });
  });

  it('updates note flags without content', async () => {
    prisma.managementNote.findFirst.mockResolvedValue(baseNote);
    prisma.managementNote.update.mockResolvedValue({
      ...baseNote,
      visibleForPm: true,
    });

    const result = await service.updateNote('subject', 'note-1', {
      visibleForPm: true,
    });

    expect(result.visibleForPm).toBe(true);
  });

  it('rejects empty PATCH bodies', async () => {
    await expect(
      service.updateNote('subject', 'note-1', {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deletes a note scoped to the subject', async () => {
    prisma.managementNote.findFirst.mockResolvedValue(baseNote);
    prisma.managementNote.delete.mockResolvedValue(baseNote);

    await service.deleteNote('subject', 'note-1');

    expect(prisma.managementNote.delete).toHaveBeenCalledWith({
      where: { id: 'note-1' },
    });
  });

  it('returns 404 when note belongs to another subject', async () => {
    prisma.managementNote.findFirst.mockResolvedValue(null);

    await expect(
      service.updateNote('other-subject', 'note-1', { content: 'Nope' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
