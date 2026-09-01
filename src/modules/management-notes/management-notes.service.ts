import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ManagementNote, User } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ResolvedAudience,
  SectionAccessLevel,
} from '../contracts/access-resolver.contract';
import { CreateManagementNoteDto } from './dto/create-management-note.dto';
import { UpdateManagementNoteDto } from './dto/update-management-note.dto';
import {
  ManagementNoteEntity,
  ManagementNoteReadEntity,
  ManagementNotesSectionEntity,
} from './entities/management-note.entity';

type NoteWithAuthor = ManagementNote & {
  authorEmployee: {
    id: string;
    user: Pick<User, 'name' | 'email'>;
  };
};

@Injectable()
export class ManagementNotesService {
  constructor(private readonly prisma: PrismaService) {}

  async buildSection(
    subjectEmployeeId: string,
    audience: ResolvedAudience,
    accessLevel: SectionAccessLevel,
  ): Promise<ManagementNotesSectionEntity> {
    const notes = await this.loadNotesForSubject(subjectEmployeeId);
    return this.toSectionDto(notes, audience, accessLevel);
  }

  async createNote(
    subjectEmployeeId: string,
    authorEmployeeId: string,
    dto: CreateManagementNoteDto,
  ): Promise<ManagementNoteEntity> {
    const note = await this.prisma.managementNote.create({
      data: {
        subjectEmployeeId,
        authorEmployeeId,
        content: dto.content,
        visibleForEmployee: dto.visibleForEmployee ?? false,
        visibleForPm: dto.visibleForPm ?? false,
      },
      include: this.authorInclude,
    });
    return this.toRwDto(note);
  }

  async updateNote(
    subjectEmployeeId: string,
    noteId: string,
    dto: UpdateManagementNoteDto,
  ): Promise<ManagementNoteEntity> {
    this.assertPatchHasFields(dto);
    const existing = await this.findNoteForSubject(subjectEmployeeId, noteId);
    const note = await this.prisma.managementNote.update({
      where: { id: existing.id },
      data: {
        ...(dto.content !== undefined ? { content: dto.content } : {}),
        ...(dto.visibleForEmployee !== undefined
          ? { visibleForEmployee: dto.visibleForEmployee }
          : {}),
        ...(dto.visibleForPm !== undefined
          ? { visibleForPm: dto.visibleForPm }
          : {}),
      },
      include: this.authorInclude,
    });
    return this.toRwDto(note);
  }

  async deleteNote(subjectEmployeeId: string, noteId: string): Promise<void> {
    const existing = await this.findNoteForSubject(subjectEmployeeId, noteId);
    await this.prisma.managementNote.delete({ where: { id: existing.id } });
  }

  private readonly authorInclude = {
    authorEmployee: {
      include: {
        user: { select: { name: true, email: true } },
      },
    },
  } as const;

  private async loadNotesForSubject(
    subjectEmployeeId: string,
  ): Promise<NoteWithAuthor[]> {
    return this.prisma.managementNote.findMany({
      where: { subjectEmployeeId },
      include: this.authorInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
  }

  private toSectionDto(
    notes: NoteWithAuthor[],
    audience: ResolvedAudience,
    accessLevel: SectionAccessLevel,
  ): ManagementNotesSectionEntity {
    if (accessLevel === 'RW') {
      return { notes: notes.map((note) => this.toRwDto(note)) };
    }

    if (audience.role === 'Self') {
      const visible = notes.filter((note) => note.visibleForEmployee);
      return { notes: visible.map((note) => this.toReadDto(note)) };
    }

    if (audience.role === 'ProjectLine' && audience.sections.S7 === 'R') {
      const visible = notes.filter((note) => note.visibleForPm);
      const hasHiddenNotes =
        notes.length > 0 && notes.some((note) => !note.visibleForPm);
      return {
        notes: visible.map((note) => this.toReadDto(note)),
        hasHiddenNotes,
      };
    }

    throw new ForbiddenException('Unsupported S7 read audience');
  }

  private toRwDto(note: NoteWithAuthor): ManagementNoteEntity {
    return {
      ...this.toReadDto(note),
      visibleForEmployee: note.visibleForEmployee,
      visibleForPm: note.visibleForPm,
    };
  }

  private toReadDto(note: NoteWithAuthor): ManagementNoteReadEntity {
    return {
      id: note.id,
      content: note.content,
      author: {
        id: note.authorEmployee.id,
        displayName: this.authorDisplayName(note.authorEmployee.user),
      },
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    };
  }

  private authorDisplayName(user: Pick<User, 'name' | 'email'>): string {
    const name = user.name?.trim();
    if (name) {
      return name;
    }
    if (user.email) {
      return user.email;
    }
    return 'Unknown author';
  }

  private async findNoteForSubject(
    subjectEmployeeId: string,
    noteId: string,
  ): Promise<ManagementNote> {
    const note = await this.prisma.managementNote.findFirst({
      where: { id: noteId, subjectEmployeeId },
    });
    if (!note) {
      throw new NotFoundException(`Management note ${noteId} not found`);
    }
    return note;
  }

  private assertPatchHasFields(dto: UpdateManagementNoteDto): void {
    const hasField =
      dto.content !== undefined ||
      dto.visibleForEmployee !== undefined ||
      dto.visibleForPm !== undefined;
    if (!hasField) {
      throw new BadRequestException(
        'At least one of content, visibleForEmployee, or visibleForPm is required',
      );
    }
  }
}
