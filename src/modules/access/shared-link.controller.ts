import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUserProvider } from '../contracts/current-user-provider.contract';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateSharedLinkDto,
  ListSharedLinksResponseDto,
  RevokeSharedLinkResponseDto,
  SharedLinkAccessLogResponseDto,
} from './dto/create-shared-link.dto';
import { EmployeeProfileEntity } from './entities/employee-profile.entity';
import { ProfileAssemblerService } from './profile-assembler.service';
import {
  INACTIVE_LINK_MESSAGE,
  SharedLinkService,
} from './shared-link.service';
import { SwaggerGetEmployeeProfile } from './profile.swagger';
import {
  SwaggerCreateSharedLink,
  SwaggerGetSharedLinkAccessLog,
  SwaggerListSharedLinks,
  SwaggerRevokeSharedLink,
} from './shared-link.swagger';

@ApiTags('shared-links')
@Controller()
export class SharedLinkController {
  constructor(
    private readonly sharedLinks: SharedLinkService,
    private readonly assembler: ProfileAssemblerService,
    private readonly currentUser: CurrentUserProvider,
    private readonly prisma: PrismaService,
  ) {}

  @Post('employees/:employeeId/shared-links')
  @SwaggerCreateSharedLink()
  async create(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: CreateSharedLinkDto,
  ) {
    const creatorEmployeeId = await this.resolveViewerEmployeeId(request);
    return this.sharedLinks.createLink(creatorEmployeeId, employeeId, dto);
  }

  @Get('employees/:employeeId/shared-links')
  @SwaggerListSharedLinks()
  async listActive(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ): Promise<ListSharedLinksResponseDto> {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    const links = await this.sharedLinks.listActiveForSubject(
      viewerEmployeeId,
      employeeId,
    );
    return { links };
  }

  @Post('employees/:employeeId/shared-links/:linkId/revoke')
  @SwaggerRevokeSharedLink()
  async revoke(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
  ): Promise<RevokeSharedLinkResponseDto> {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    return this.sharedLinks.revokeLink(viewerEmployeeId, employeeId, linkId);
  }

  @Get('employees/:employeeId/shared-links/:linkId/access-log')
  @SwaggerGetSharedLinkAccessLog()
  async accessLog(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
  ): Promise<SharedLinkAccessLogResponseDto> {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    const entries = await this.sharedLinks.getAccessLog(
      viewerEmployeeId,
      employeeId,
      linkId,
    );
    return { entries };
  }

  @Get('shared-links/:token/profile')
  @SwaggerGetEmployeeProfile()
  async consumeProfile(
    @Req() request: Request,
    @Param('token') token: string,
  ): Promise<EmployeeProfileEntity> {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    const originIp = extractClientIp(request);
    const link = await this.sharedLinks.findLinkByToken(token);

    const lifecycleDenial = this.sharedLinks.getLifecycleDenial(link);
    if (lifecycleDenial) {
      await this.sharedLinks.recordAccessAttempt(
        link,
        viewerEmployeeId,
        originIp,
        'denied',
        lifecycleDenial,
      );
      throw new NotFoundException(INACTIVE_LINK_MESSAGE);
    }

    if (link.recipientEmployeeId !== viewerEmployeeId) {
      await this.sharedLinks.recordAccessAttempt(
        link,
        viewerEmployeeId,
        originIp,
        'denied',
        'wrong_recipient',
      );
      throw new ForbiddenException('You are not the recipient of this link');
    }

    const profile = await this.assembler.assembleProfileViaSharedLink(link);

    await this.sharedLinks.recordAccessAttempt(
      link,
      viewerEmployeeId,
      originIp,
      'granted',
    );

    return profile;
  }

  private async resolveViewerEmployeeId(request: Request): Promise<string> {
    const { userId } = await this.currentUser.getCurrentUser(request);
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

function extractClientIp(request: Request): string | null {
  const forwarded = request.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof raw === 'string' && raw.length > 0) {
    const ip = raw.split(',')[0]?.trim();
    if (ip) {
      return ip;
    }
  }
  return request.ip ?? null;
}
