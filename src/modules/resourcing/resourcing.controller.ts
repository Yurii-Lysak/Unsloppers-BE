import {
  Body,
  Controller,
  ForbiddenException,
  Get,
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
import { ResourcingService } from './resourcing.service';
import {
  SwaggerCreateResourcingRequest,
  SwaggerListResourcingRequests,
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
    await this.assertCanAccessResourcing(userId);
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
    await this.assertCanAccessResourcing(userId);
    const viewerEmployeeId = await this.resolveViewerEmployeeId(userId);
    return this.resourcing.listRequests(viewerEmployeeId);
  }

  /**
   * Story 6.1 — permission-only gate via C8. Unlike campaigns, there is no
   * manager/PP widening here; only explicit functional-role grants count.
   */
  private async assertCanAccessResourcing(userId: string): Promise<void> {
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
