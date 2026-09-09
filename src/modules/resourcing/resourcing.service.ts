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
import { DecideResourcingProposalDto } from './dto/decide-resourcing-proposal.dto';
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
   * Story 6.3 — `GET /resourcing/requests/pending-review`: requests in
   * `pending_dm_review` where `reviewingDmId` matches the viewer. Gives the
   * reviewing DM an inbox on `/resourcing` without widening the author/DM
   * create list.
   */
  async listPendingReview(
    viewerEmployeeId: string,
  ): Promise<ResourcingRequestReadEntity[]> {
    const requests = await this.prisma.resourcingRequest.findMany({
      where: {
        status: 'pending_dm_review',
        reviewingDmId: viewerEmployeeId,
      },
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
   * Story 6.2 — `GET /resourcing/requests/:id`: detail + proposals.
   * Story 6.3 widens the gate: reachable by the live routed UM (NOT_ROUTED —
   * 403 otherwise) **or** the request's resolved reviewing DM. This is the
   * service-level half of the widening — the controller's permission gate
   * must accept `FULFIL_RESOURCING_REQUESTS` OR `APPROVE_REJECT_CANDIDATES`
   * too, or a DM never reaches this code path at all.
   */
  async getDetail(
    viewerEmployeeId: string,
    requestId: string,
  ): Promise<ResourcingRequestDetailEntity> {
    const request = await this.findRequestOrThrow(requestId);
    const isReviewingDm =
      request.reviewingDmId !== null &&
      viewerEmployeeId === request.reviewingDmId;
    const isRoutedUm = await this.isRoutedUm(
      viewerEmployeeId,
      request.department,
    );
    if (!isReviewingDm && !isRoutedUm) {
      throw new ForbiddenException(
        'You are not authorized to view this resourcing request',
      );
    }

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
    const candidatePool =
      isRoutedUm && !isReviewingDm
        ? await this.loadCandidatePool(viewerEmployeeId)
        : undefined;
    const approvedCount = proposals.filter(
      (proposal) => proposal.status === 'approved',
    ).length;

    return {
      ...this.toReadDto(
        request,
        viewerEmployeeId,
        dmProjectIds,
        departmentManagers,
      ),
      proposals: await Promise.all(
        proposals.map((proposal) =>
          this.toProposalEntity(proposal, { viewerEmployeeId, isReviewingDm }),
        ),
      ),
      reviewingDmId: request.reviewingDmId,
      candidatePool,
      approvedCount,
      viewerIsReviewingDm: isReviewingDm,
    };
  }

  /**
   * Story 6.3 — `POST /resourcing/requests/:id/proposals/:proposalId/decide`:
   * transitions a `proposed` proposal to `approved`/`rejected`, or reverses
   * an `approved` proposal to `rejected`. Gated to the request's resolved
   * reviewing DM (NOT_REVIEWING_DM — 403 otherwise, matrix row) with the
   * request `pending_dm_review` (REQUEST_NOT_PENDING — 409 otherwise).
   */
  async decide(
    viewerEmployeeId: string,
    requestId: string,
    proposalId: string,
    dto: DecideResourcingProposalDto,
  ): Promise<ResourcingProposalEntity> {
    const request = await this.findRequestOrThrow(requestId);
    if (viewerEmployeeId !== request.reviewingDmId) {
      throw new ForbiddenException(
        'You are not the reviewing Delivery Manager for this request',
      );
    }
    if (request.status !== 'pending_dm_review') {
      throw new ConflictException(
        'Resourcing request is not pending DM review',
      );
    }

    const proposal = await this.prisma.resourcingProposal.findUnique({
      where: { id: proposalId },
    });
    if (!proposal || proposal.requestId !== requestId) {
      throw new NotFoundException('Resourcing proposal not found');
    }

    const reason = dto.reason?.trim() || null;
    if (dto.decision === 'rejected' && !reason) {
      throw new BadRequestException(
        'A reason is required to reject or reverse a proposal decision',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Serializes concurrent `decide` calls on the same request — a naive
      // read-then-write here lets two concurrent approvals (or an
      // approve/reject race on the same row) each pass their pre-write
      // check before either commits, over-filling headcount or silently
      // discarding one decision (spec's concurrency boundary).
      await tx.$queryRaw`SELECT id FROM resourcing_requests WHERE id = ${requestId} FOR UPDATE`;

      const current = await tx.resourcingProposal.findUnique({
        where: { id: proposalId },
      });
      if (!current || current.requestId !== requestId) {
        throw new NotFoundException('Resourcing proposal not found');
      }
      if (current.status === 'rejected') {
        throw new ConflictException('Proposal decision is already final');
      }

      if (dto.decision === 'approved') {
        if (current.status !== 'proposed') {
          throw new BadRequestException('Proposal has already been decided');
        }
        const approvedCount = await tx.resourcingProposal.count({
          where: { requestId, status: 'approved' },
        });
        if (approvedCount >= request.headcount) {
          throw new ConflictException(
            'Request headcount is already fully approved',
          );
        }
      }

      const result = await tx.resourcingProposal.updateMany({
        where: { id: proposalId, status: current.status },
        data: {
          status: dto.decision,
          decisionReason: dto.decision === 'rejected' ? reason : null,
        },
      });
      if (result.count === 0) {
        throw new ConflictException('Proposal decision has already changed');
      }

      return tx.resourcingProposal.findUniqueOrThrow({
        where: { id: proposalId },
        include: this.proposalInclude,
      });
    });

    return this.toProposalEntity(updated, {
      viewerEmployeeId,
      isReviewingDm: true,
    });
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
    if (!(await this.isRoutedUm(viewerEmployeeId, departmentName))) {
      throw new ForbiddenException(
        'You are not the current Unit Manager routed to this request',
      );
    }
  }

  /**
   * Story 6.3 — non-throwing routing check, used by `getDetail` to widen its
   * gate with an OR (reviewing DM) rather than short-circuiting on the UM
   * check alone.
   */
  private async isRoutedUm(
    viewerEmployeeId: string,
    departmentName: string,
  ): Promise<boolean> {
    const department =
      await this.departmentDirectory.getDepartmentByName(departmentName);
    return department?.managerId === viewerEmployeeId;
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

  /**
   * `options` is omitted for viewers who can never be the reviewing DM (e.g.
   * the UM's own `createProposal` response) — `sharedLinkToken` only
   * resolves `options.isReviewingDm` is true (spec Boundaries: "for internal
   * candidates only when the viewer is the reviewing DM").
   */
  private async toProposalEntity(
    proposal: ResourcingProposalWithCandidate,
    options?: { viewerEmployeeId: string; isReviewingDm: boolean },
  ): Promise<ResourcingProposalEntity> {
    const entity: ResourcingProposalEntity = {
      id: proposal.id,
      requestId: proposal.requestId,
      proposedById: proposal.proposedById,
      candidateEmployeeId: proposal.candidateEmployeeId,
      peopleForceCandidateId: proposal.peopleForceCandidateId,
      peopleForceCandidateUrl: proposal.peopleForceCandidateUrl,
      status: proposal.status,
      decisionReason: proposal.decisionReason,
      createdAt: proposal.createdAt.toISOString(),
    };
    if (proposal.candidateEmployee) {
      entity.candidateDisplayName = this.displayName(
        proposal.candidateEmployee.user,
      );
    }
    if (options?.isReviewingDm && proposal.candidateEmployeeId) {
      entity.sharedLinkToken = await this.resolveSharedLinkToken(
        proposal.candidateEmployeeId,
        options.viewerEmployeeId,
      );
    }
    return entity;
  }

  /**
   * Story 6.3 — reuses the shared link 6.2's submit flow already created
   * (naming the reviewing DM as recipient); no new write path. Known
   * limitation, accepted per spec: `SharedLink` carries no linkage back to a
   * specific resourcing proposal/request, so if the same internal candidate
   * is proposed on two different requests reviewed by the same DM, this
   * returns whichever link is most recently created for *either* request.
   */
  private async resolveSharedLinkToken(
    candidateEmployeeId: string,
    viewerEmployeeId: string,
  ): Promise<string | null> {
    const link = await this.prisma.sharedLink.findFirst({
      where: {
        subjectEmployeeId: candidateEmployeeId,
        recipientEmployeeId: viewerEmployeeId,
        revokedAt: null,
        expiresAt: { gt: this.clock.now() },
      },
      orderBy: { createdAt: 'desc' },
      select: { token: true },
    });
    return link?.token ?? null;
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
