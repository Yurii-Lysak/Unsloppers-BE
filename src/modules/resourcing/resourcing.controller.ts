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
import { ResourcingService } from './resourcing.service';
import {
  SwaggerCreateResourcingProposal,
  SwaggerCreateResourcingRequest,
  SwaggerGetResourcingRequestDetail,
  SwaggerListAssignedResourcingRequests,
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

  @Get(':id')
  @SwaggerGetResourcingRequestDetail()
  async getDetail(@Req() request: Request, @Param('id') id: string) {
    const { userId } = await this.currentUser.getCurrentUser(request);
    await this.assertCanFulfilResourcing(userId);
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
