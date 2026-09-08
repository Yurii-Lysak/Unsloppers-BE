import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  Prisma,
  ResourcingRequest,
  User,
} from '../../generated/prisma/client';
import { Clock } from '../../clock/clock.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DepartmentDirectory } from '../contracts/department-directory.contract';
import { BUILT_IN_ROLE_NAMES } from '../contracts/permission-keys';
import { CreateResourcingRequestDto } from './dto/create-resourcing-request.dto';
import { CreateResourcingProposalDto } from './dto/create-resourcing-proposal.dto';
import { ResourcingRequestReadEntity } from './entities/resourcing-request.entity';
import {
  ResourcingCandidatePoolEntryEntity,
  ResourcingRequestDetailEntity,
} from './entities/resourcing-request-detail.entity';
import { ResourcingProposalEntity } from './entities/resourcing-proposal.entity';
import { normalizeCreateResourcingRequestFields } from './resourcing-input';
import { normalizeCreateResourcingProposalInput } from './resourcing-proposal-input';

type ResourcingRequestWithAuthor = ResourcingRequest & {
  author: {
    id: string;
    user: Pick<User, 'name' | 'email'>;
  };
};

type ResourcingProposalWithCandidate = Prisma.ResourcingProposalGetPayload<{
  include: {
    candidateEmployee: {
      include: { user: { select: { name: true; email: true } } };
    };
  };
}>;

@Injectable()
export class ResourcingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly departmentDirectory: DepartmentDirectory,
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
    const departmentManagers = await this.loadDepartmentManagersByName([
      request.department,
    ]);
    return this.toReadDto(
      request,
      viewerEmployeeId,
      dmProjectIds,
      departmentManagers,
    );
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
    const departmentManagers = await this.loadDepartmentManagersByName(
      requests.map((request) => request.department),
    );
    return requests.map((request) =>
      this.toReadDto(
        request,
        viewerEmployeeId,
        dmProjectIds,
        departmentManagers,
      ),
    );
  }

  /**
   * Story 6.2 — `GET /resourcing/requests/assigned`: open requests live-routed
   * to `viewerEmployeeId` as Unit Manager (re-resolved on every call, never
   * pinned — spec's Routing boundary).
   */
  async listAssigned(
    viewerEmployeeId: string,
  ): Promise<ResourcingRequestReadEntity[]> {
    const openRequests = await this.prisma.resourcingRequest.findMany({
      where: { status: 'open' },
      include: this.authorInclude,
      orderBy: { createdAt: 'desc' },
    });
    const departmentManagers = await this.loadDepartmentManagersByName(
      openRequests.map((request) => request.department),
    );
    const routed = openRequests.filter(
      (request) =>
        departmentManagers.get(request.department) === viewerEmployeeId,
    );
    const projectIds = routed
      .map((request) => request.projectId)
      .filter((projectId): projectId is string => Boolean(projectId));
    const dmProjectIds = await this.loadDmProjectIdsForViewer(
      viewerEmployeeId,
      projectIds,
    );
    return routed.map((request) =>
      this.toReadDto(
        request,
        viewerEmployeeId,
        dmProjectIds,
        departmentManagers,
      ),
    );
  }

  /**
   * Story 6.2 — `GET /resourcing/requests/:id`: detail + proposals, gated to
   * the live routed UM (NOT_ROUTED — 403 otherwise, matrix row).
   */
  async getDetail(
    viewerEmployeeId: string,
    requestId: string,
  ): Promise<ResourcingRequestDetailEntity> {
    const request = await this.findRequestOrThrow(requestId);
    await this.assertRouted(viewerEmployeeId, request.department);

    const dmProjectIds = await this.loadDmProjectIdsForViewer(
      viewerEmployeeId,
      request.projectId ? [request.projectId] : [],
    );
    const departmentManagers = await this.loadDepartmentManagersByName([
      request.department,
    ]);
    const proposals = await this.prisma.resourcingProposal.findMany({
      where: { requestId },
      include: this.proposalInclude,
      orderBy: { createdAt: 'asc' },
    });
    const candidatePool = await this.loadCandidatePool(viewerEmployeeId);

    return {
      ...this.toReadDto(
        request,
        viewerEmployeeId,
        dmProjectIds,
        departmentManagers,
      ),
      proposals: proposals.map((proposal) => this.toProposalEntity(proposal)),
      reviewingDmId: request.reviewingDmId,
      candidatePool,
    };
  }

  /**
   * Story 6.2 — `POST /resourcing/requests/:id/proposals`: attach one
   * internal or external candidate. `open` requests only (matrix row
   * `SUBMIT_NOT_OPEN` covers submit; this mirrors it for propose).
   */
  async createProposal(
    viewerEmployeeId: string,
    requestId: string,
    dto: CreateResourcingProposalDto,
  ): Promise<ResourcingProposalEntity> {
    const request = await this.findRequestOrThrow(requestId);
    await this.assertRouted(viewerEmployeeId, request.department);
    if (request.status !== 'open') {
      throw new ConflictException(
        'Resourcing request is not open for new proposals',
      );
    }

    const normalized = normalizeCreateResourcingProposalInput(dto);
    if (normalized.kind === 'internal') {
      await this.assertCandidateInManagedUnit(
        viewerEmployeeId,
        normalized.candidateEmployeeId,
      );
    }

    const created = await this.prisma.resourcingProposal.create({
      data: {
        requestId,
        proposedById: viewerEmployeeId,
        candidateEmployeeId:
          normalized.kind === 'internal'
            ? normalized.candidateEmployeeId
            : null,
        peopleForceCandidateId:
          normalized.kind === 'external'
            ? normalized.peopleForceCandidateId
            : null,
        peopleForceCandidateUrl:
          normalized.kind === 'external'
            ? normalized.peopleForceCandidateUrl
            : null,
        status: 'proposed',
      },
      include: this.proposalInclude,
    });

    return this.toProposalEntity(created);
  }

  /**
   * Story 6.2 — `POST /resourcing/requests/:id/submit`: transitions
   * `open` → `pending_dm_review`, resolving and storing `reviewingDmId`
   * once (immutable in 6.2). Requires at least one `proposed` proposal
   * (`SUBMIT_EMPTY`) and `status === 'open'` (`SUBMIT_NOT_OPEN`).
   */
  async submit(
    viewerEmployeeId: string,
    requestId: string,
  ): Promise<ResourcingRequestDetailEntity> {
    const request = await this.findRequestOrThrow(requestId);
    await this.assertRouted(viewerEmployeeId, request.department);
    if (request.status !== 'open') {
      throw new ConflictException(
        'Resourcing request is not open — it may already be submitted',
      );
    }

    const proposedCount = await this.prisma.resourcingProposal.count({
      where: { requestId, status: 'proposed' },
    });
    if (proposedCount === 0) {
      throw new BadRequestException(
        'Attach at least one candidate before submitting for DM review',
      );
    }

    const reviewingDmId = await this.resolveReviewingDmId(request);
    await this.prisma.resourcingRequest.update({
      where: { id: requestId },
      data: { status: 'pending_dm_review', reviewingDmId },
    });

    return this.getDetail(viewerEmployeeId, requestId);
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

  /**
   * Story 6.2 C12 — one `getDepartmentByName` call per distinct department
   * name in the current batch. Live-resolved every call, never cached
   * across requests (Routing boundary).
   */
  private async loadDepartmentManagersByName(
    departmentNames: string[],
  ): Promise<Map<string, string | null>> {
    const uniqueNames = [...new Set(departmentNames)];
    const map = new Map<string, string | null>();
    for (const name of uniqueNames) {
      const department =
        await this.departmentDirectory.getDepartmentByName(name);
      map.set(name, department?.managerId ?? null);
    }
    return map;
  }

  private async assertRouted(
    viewerEmployeeId: string,
    departmentName: string,
  ): Promise<void> {
    const department =
      await this.departmentDirectory.getDepartmentByName(departmentName);
    if (!department || department.managerId !== viewerEmployeeId) {
      throw new ForbiddenException(
        'You are not the current Unit Manager routed to this request',
      );
    }
  }

  private async findRequestOrThrow(
    requestId: string,
  ): Promise<ResourcingRequestWithAuthor> {
    const request = await this.prisma.resourcingRequest.findUnique({
      where: { id: requestId },
      include: this.authorInclude,
    });
    if (!request) {
      throw new NotFoundException('Resourcing request not found');
    }
    return request;
  }

  private async assertCandidateInManagedUnit(
    proposerId: string,
    candidateEmployeeId: string,
  ): Promise<void> {
    const candidateDepartment = await this.prisma.departmentHistory.findFirst({
      where: { employeeId: candidateEmployeeId, effectiveTo: null },
      select: { value: true },
    });
    if (!candidateDepartment) {
      throw new BadRequestException(
        'Candidate has no current department on record',
      );
    }

    const department = await this.departmentDirectory.getDepartmentByName(
      candidateDepartment.value,
    );
    const managedDepartmentIds =
      await this.departmentDirectory.getManagedDepartmentIds(proposerId);
    if (!department || !managedDepartmentIds.includes(department.id)) {
      throw new BadRequestException(
        'Candidate is outside your managed department',
      );
    }
  }

  private async loadCandidatePool(
    viewerEmployeeId: string,
  ): Promise<ResourcingCandidatePoolEntryEntity[]> {
    const managedDepartmentIds =
      await this.departmentDirectory.getManagedDepartmentIds(viewerEmployeeId);
    if (managedDepartmentIds.length === 0) {
      return [];
    }

    const departments = await this.prisma.department.findMany({
      where: { id: { in: managedDepartmentIds } },
      select: { name: true },
    });
    const departmentNames = departments.map((department) => department.name);
    if (departmentNames.length === 0) {
      return [];
    }

    const rows = await this.prisma.departmentHistory.findMany({
      where: { effectiveTo: null, value: { in: departmentNames } },
      include: {
        employee: {
          select: {
            id: true,
            employmentStatus: true,
            user: { select: { name: true, email: true } },
          },
        },
      },
    });

    return rows
      .filter((row) => row.employee.employmentStatus !== 'dismissed')
      .map((row) => ({
        id: row.employee.id,
        displayName: this.displayName(row.employee.user),
      }));
  }

  /**
   * Reviewing DM resolution (spec Boundaries): project-based DM first, then
   * the author's own DM functional role, then (PM author) their manager.
   * Resolves to `null` when none apply — bootcamp's `create_resourcing_requests`
   * grant is DM/PM-only, so this always resolves in practice.
   */
  private async resolveReviewingDmId(
    request: ResourcingRequest,
  ): Promise<string | null> {
    if (request.projectId) {
      const today = this.startOfTodayUtc();
      const assignment = await this.prisma.projectAssignment.findFirst({
        where: {
          projectId: request.projectId,
          OR: [{ endDate: null }, { endDate: { gte: today } }],
        },
        select: { dmId: true },
      });
      if (assignment) {
        return assignment.dmId;
      }
    }

    const authorIsDm = await this.employeeHoldsBuiltInRole(
      request.authorId,
      BUILT_IN_ROLE_NAMES.DELIVERY_MANAGER,
    );
    if (authorIsDm) {
      return request.authorId;
    }

    const authorIsPm = await this.employeeHoldsBuiltInRole(
      request.authorId,
      BUILT_IN_ROLE_NAMES.PROJECT_MANAGER,
    );
    if (authorIsPm) {
      const author = await this.prisma.employee.findUnique({
        where: { id: request.authorId },
        select: { managerId: true },
      });
      return author?.managerId ?? null;
    }

    return null;
  }

  private async employeeHoldsBuiltInRole(
    employeeId: string,
    roleName: string,
  ): Promise<boolean> {
    const count = await this.prisma.functionalRoleAssignment.count({
      where: {
        employeeId,
        role: { name: { equals: roleName, mode: 'insensitive' } },
      },
    });
    return count > 0;
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

  private readonly proposalInclude = {
    candidateEmployee: {
      include: { user: { select: { name: true, email: true } } },
    },
  } as const;

  private toReadDto(
    request: ResourcingRequestWithAuthor,
    viewerEmployeeId: string,
    dmProjectIds: Set<string>,
    departmentManagers: Map<string, string | null>,
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

    if (
      this.canViewExpectedCompBand(
        request,
        viewerEmployeeId,
        dmProjectIds,
        departmentManagers,
      )
    ) {
      dto.expectedCompBand = request.expectedCompBand;
    }

    return dto;
  }

  private toProposalEntity(
    proposal: ResourcingProposalWithCandidate,
  ): ResourcingProposalEntity {
    const entity: ResourcingProposalEntity = {
      id: proposal.id,
      requestId: proposal.requestId,
      proposedById: proposal.proposedById,
      candidateEmployeeId: proposal.candidateEmployeeId,
      peopleForceCandidateId: proposal.peopleForceCandidateId,
      peopleForceCandidateUrl: proposal.peopleForceCandidateUrl,
      status: proposal.status,
      createdAt: proposal.createdAt.toISOString(),
    };
    if (proposal.candidateEmployee) {
      entity.candidateDisplayName = this.displayName(
        proposal.candidateEmployee.user,
      );
    }
    return entity;
  }

  private canViewExpectedCompBand(
    request: ResourcingRequest,
    viewerEmployeeId: string,
    dmProjectIds: Set<string>,
    departmentManagers: Map<string, string | null>,
  ): boolean {
    if (request.authorId === viewerEmployeeId) {
      return true;
    }
    if (request.projectId && dmProjectIds.has(request.projectId)) {
      return true;
    }
    if (departmentManagers.get(request.department) === viewerEmployeeId) {
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
