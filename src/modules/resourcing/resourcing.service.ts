import { Injectable } from '@nestjs/common';
import type {
  Prisma,
  ResourcingRequest,
  User,
} from '../../generated/prisma/client';
import { Clock } from '../../clock/clock.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateResourcingRequestDto } from './dto/create-resourcing-request.dto';
import { ResourcingRequestReadEntity } from './entities/resourcing-request.entity';
import { normalizeCreateResourcingRequestFields } from './resourcing-input';

type ResourcingRequestWithAuthor = ResourcingRequest & {
  author: {
    id: string;
    user: Pick<User, 'name' | 'email'>;
  };
};

@Injectable()
export class ResourcingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async createRequest(
    authorId: string,
    viewerEmployeeId: string,
    dto: CreateResourcingRequestDto,
  ): Promise<ResourcingRequestReadEntity> {
    const normalized = normalizeCreateResourcingRequestFields(dto);
    const request = await this.prisma.resourcingRequest.create({
      data: {
        authorId,
        vacancyDetails: normalized.vacancyDetails,
        expectedCompBand: normalized.expectedCompBand,
        duration: normalized.duration,
        workload: normalized.workload,
        headcount: normalized.headcount,
        department: normalized.department,
        projectId: normalized.projectId,
        status: 'open',
      },
      include: this.authorInclude,
    });
    const dmProjectIds = await this.loadDmProjectIdsForViewer(
      viewerEmployeeId,
      request.projectId ? [request.projectId] : [],
    );
    return this.toReadDto(request, viewerEmployeeId, dmProjectIds);
  }

  async listRequests(
    viewerEmployeeId: string,
  ): Promise<ResourcingRequestReadEntity[]> {
    const today = this.startOfTodayUtc();
    const requests = await this.prisma.resourcingRequest.findMany({
      where: this.buildListWhere(viewerEmployeeId, today),
      include: this.authorInclude,
      orderBy: { createdAt: 'desc' },
    });
    const projectIds = [
      ...new Set(
        requests
          .map((request) => request.projectId)
          .filter((projectId): projectId is string => Boolean(projectId)),
      ),
    ];
    const dmProjectIds = await this.loadDmProjectIdsForViewer(
      viewerEmployeeId,
      projectIds,
    );
    return requests.map((request) =>
      this.toReadDto(request, viewerEmployeeId, dmProjectIds),
    );
  }

  private buildListWhere(
    viewerEmployeeId: string,
    today: Date,
  ): Prisma.ResourcingRequestWhereInput {
    return {
      OR: [
        { authorId: viewerEmployeeId },
        {
          author: {
            pmProjectAssignments: {
              some: {
                dmId: viewerEmployeeId,
                OR: [{ endDate: null }, { endDate: { gte: today } }],
              },
            },
          },
        },
      ],
    };
  }

  private async loadDmProjectIdsForViewer(
    viewerEmployeeId: string,
    projectIds: string[],
  ): Promise<Set<string>> {
    if (projectIds.length === 0) {
      return new Set();
    }
    const today = this.startOfTodayUtc();
    const rows = await this.prisma.projectAssignment.findMany({
      where: {
        dmId: viewerEmployeeId,
        projectId: { in: projectIds },
        OR: [{ endDate: null }, { endDate: { gte: today } }],
      },
      select: { projectId: true },
    });
    return new Set(rows.map((row) => row.projectId));
  }

  private startOfTodayUtc(): Date {
    const now = this.clock.now();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
  }

  private readonly authorInclude = {
    author: {
      include: {
        user: { select: { name: true, email: true } },
      },
    },
  } as const;

  private toReadDto(
    request: ResourcingRequestWithAuthor,
    viewerEmployeeId: string,
    dmProjectIds: Set<string>,
  ): ResourcingRequestReadEntity {
    const dto: ResourcingRequestReadEntity = {
      id: request.id,
      vacancyDetails: request.vacancyDetails,
      duration: request.duration,
      workload: request.workload,
      headcount: request.headcount,
      department: request.department,
      projectId: request.projectId,
      status: request.status,
      author: {
        id: request.author.id,
        displayName: this.displayName(request.author.user),
      },
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
    };

    if (this.canViewExpectedCompBand(request, viewerEmployeeId, dmProjectIds)) {
      dto.expectedCompBand = request.expectedCompBand;
    }

    return dto;
  }

  private canViewExpectedCompBand(
    request: ResourcingRequest,
    viewerEmployeeId: string,
    dmProjectIds: Set<string>,
  ): boolean {
    if (request.authorId === viewerEmployeeId) {
      return true;
    }
    if (request.projectId && dmProjectIds.has(request.projectId)) {
      return true;
    }
    return false;
  }

  private displayName(user: Pick<User, 'name' | 'email'>): string {
    const name = user.name?.trim();
    if (name) {
      return name;
    }
    if (user.email) {
      return user.email;
    }
    return 'Unknown';
  }
}
