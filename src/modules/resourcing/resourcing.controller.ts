import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUserProvider } from '../contracts/current-user-provider.contract';
import { PERMISSION_KEYS } from '../contracts/permission-keys';
import { PermissionChecker } from '../contracts/permission-checker.contract';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateResourcingRequestDto } from './dto/create-resourcing-request.dto';
import { CreateResourcingProposalDto } from './dto/create-resourcing-proposal.dto';
import { DecideResourcingProposalDto } from './dto/decide-resourcing-proposal.dto';
import { ResourcingService } from './resourcing.service';
import {
  SwaggerCreateResourcingProposal,
  SwaggerCreateResourcingRequest,
  SwaggerDecideResourcingProposal,
  SwaggerGetResourcingRequestDetail,
  SwaggerListAssignedResourcingRequests,
  SwaggerListPendingReviewResourcingRequests,
  SwaggerListResourcingRequests,
  SwaggerSubmitResourcingRequest,
} from './resourcing.swagger';

@ApiTags('resourcing')
@Controller('resourcing/requests')
export class ResourcingController {
  constructor(
    private readonly resourcing: ResourcingService,
    private readonly currentUser: CurrentUserProvider,
    private readonly prisma: PrismaService,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  @Post()
  @SwaggerCreateResourcingRequest()
  async create(
    @Req() request: Request,
    @Body() dto: CreateResourcingRequestDto,
  ) {
    const { userId } = await this.currentUser.getCurrentUser(request);
    await this.assertCanCreateResourcing(userId);
    const viewerEmployeeId = await this.resolveViewerEmployeeId(userId);
    return this.resourcing.createRequest(
      viewerEmployeeId,
      viewerEmployeeId,
      dto,
    );
  }

  @Get()
  @SwaggerListResourcingRequests()
  async list(@Req() request: Request) {
    const { userId } = await this.currentUser.getCurrentUser(request);
    await this.assertCanCreateResourcing(userId);
    const viewerEmployeeId = await this.resolveViewerEmployeeId(userId);
    return this.resourcing.listRequests(viewerEmployeeId);
  }

  /**
   * Story 6.2 — `NOTE`: declared before `:id` so `assigned` is not captured
   * as a request id.
   */
  @Get('assigned')
  @SwaggerListAssignedResourcingRequests()
  async listAssigned(@Req() request: Request) {
    const { userId } = await this.currentUser.getCurrentUser(request);
    await this.assertCanFulfilResourcing(userId);
    const viewerEmployeeId = await this.resolveViewerEmployeeId(userId);
    return this.resourcing.listAssigned(viewerEmployeeId);
  }

  /**
   * Story 6.3 — declared before `:id` so `pending-review` is not captured as
   * a request id. Reviewing-DM inbox for `/resourcing`.
   */
  @Get('pending-review')
  @SwaggerListPendingReviewResourcingRequests()
  async listPendingReview(@Req() request: Request) {
    const { userId } = await this.currentUser.getCurrentUser(request);
    await this.assertCanApproveRejectCandidates(userId);
    const viewerEmployeeId = await this.resolveViewerEmployeeId(userId);
    return this.resourcing.listPendingReview(viewerEmployeeId);
  }

  /**
   * Story 6.3 — widened to accept either fulfilment (`FULFIL_RESOURCING_REQUESTS`,
   * the routed UM) or approve/reject (`APPROVE_REJECT_CANDIDATES`, the
   * reviewing DM) — a permission-only gate the DM otherwise never holds,
   * which would 403 them before the service's own routed-UM-OR-reviewing-DM
   * check is ever reached.
   */
  @Get(':id')
  @SwaggerGetResourcingRequestDetail()
  async getDetail(@Req() request: Request, @Param('id') id: string) {
    const { userId } = await this.currentUser.getCurrentUser(request);
    await this.assertCanFulfilOrApproveResourcing(userId);
    const viewerEmployeeId = await this.resolveViewerEmployeeId(userId);
    return this.resourcing.getDetail(viewerEmployeeId, id);
  }

  @Post(':id/proposals')
  @SwaggerCreateResourcingProposal()
  async createProposal(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() dto: CreateResourcingProposalDto,
  ) {
    const { userId } = await this.currentUser.getCurrentUser(request);
    await this.assertCanFulfilResourcing(userId);
    const viewerEmployeeId = await this.resolveViewerEmployeeId(userId);
    return this.resourcing.createProposal(viewerEmployeeId, id, dto);
  }

  /**
   * Story 6.3 — own gate, distinct from fulfilment: only
   * `APPROVE_REJECT_CANDIDATES` (seeded on Delivery Manager) reaches this
   * route. The reviewing-DM identity check (`NOT_REVIEWING_DM`) lives in
   * `ResourcingService.decide`, per-request.
   */
  @Post(':id/proposals/:proposalId/decide')
  @HttpCode(HttpStatus.OK)
  @SwaggerDecideResourcingProposal()
  async decide(
    @Req() request: Request,
    @Param('id') id: string,
    @Param('proposalId') proposalId: string,
    @Body() dto: DecideResourcingProposalDto,
  ) {
    const { userId } = await this.currentUser.getCurrentUser(request);
    await this.assertCanApproveRejectCandidates(userId);
    const viewerEmployeeId = await this.resolveViewerEmployeeId(userId);
    return this.resourcing.decide(viewerEmployeeId, id, proposalId, dto);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @SwaggerSubmitResourcingRequest()
  async submit(@Req() request: Request, @Param('id') id: string) {
    const { userId } = await this.currentUser.getCurrentUser(request);
    await this.assertCanFulfilResourcing(userId);
    const viewerEmployeeId = await this.resolveViewerEmployeeId(userId);
    return this.resourcing.submit(viewerEmployeeId, id);
  }

  /**
   * Story 6.1 — permission-only gate via C8. Unlike campaigns, there is no
   * manager/PP widening here; only explicit functional-role grants count.
   */
  private async assertCanCreateResourcing(userId: string): Promise<void> {
    const hasPermission = await this.permissionChecker.hasPermission(
      userId,
      PERMISSION_KEYS.CREATE_RESOURCING_REQUESTS,
    );
    if (!hasPermission) {
      throw new ForbiddenException(
        'Viewer lacks create_resourcing_requests permission',
      );
    }
  }

  /**
   * Story 6.2 — distinct gate for the fulfilment routes (assigned list,
   * detail read, proposal create, submit). Permission-only, same shape as
   * `assertCanCreateResourcing` — routing (NOT_ROUTED) is a separate,
   * per-request check inside `ResourcingService`.
   */
  private async assertCanFulfilResourcing(userId: string): Promise<void> {
    const hasPermission = await this.permissionChecker.hasPermission(
      userId,
      PERMISSION_KEYS.FULFIL_RESOURCING_REQUESTS,
    );
    if (!hasPermission) {
      throw new ForbiddenException(
        'Viewer lacks fulfil_resourcing_requests permission',
      );
    }
  }

  /**
   * Story 6.3 — `GET /:id`'s widened gate: either fulfilment (routed UM) or
   * approve/reject (reviewing DM) permission suffices; the service layer
   * decides which role the viewer actually is.
   */
  private async assertCanFulfilOrApproveResourcing(
    userId: string,
  ): Promise<void> {
    const [canFulfil, canApprove] = await Promise.all([
      this.permissionChecker.hasPermission(
        userId,
        PERMISSION_KEYS.FULFIL_RESOURCING_REQUESTS,
      ),
      this.permissionChecker.hasPermission(
        userId,
        PERMISSION_KEYS.APPROVE_REJECT_CANDIDATES,
      ),
    ]);
    if (!canFulfil && !canApprove) {
      throw new ForbiddenException(
        'Viewer lacks fulfil_resourcing_requests or approve_reject_candidates permission',
      );
    }
  }

  /**
   * Story 6.3 — `POST .../decide`'s own gate: `APPROVE_REJECT_CANDIDATES`
   * only (seeded on Delivery Manager).
   */
  private async assertCanApproveRejectCandidates(
    userId: string,
  ): Promise<void> {
    const hasPermission = await this.permissionChecker.hasPermission(
      userId,
      PERMISSION_KEYS.APPROVE_REJECT_CANDIDATES,
    );
    if (!hasPermission) {
      throw new ForbiddenException(
        'Viewer lacks approve_reject_candidates permission',
      );
    }
  }

  private async resolveViewerEmployeeId(userId: string): Promise<string> {
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!employee) {
      throw new ForbiddenException('Authenticated user has no employee record');
    }
    return employee.id;
  }
}
