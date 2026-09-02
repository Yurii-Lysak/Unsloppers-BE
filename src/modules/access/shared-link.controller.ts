import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUserProvider } from '../contracts/current-user-provider.contract';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSharedLinkDto } from './dto/create-shared-link.dto';
import { EmployeeProfileEntity } from './entities/employee-profile.entity';
import { ProfileAssemblerService } from './profile-assembler.service';
import { SharedLinkService } from './shared-link.service';
import { SwaggerGetEmployeeProfile } from './profile.swagger';
import { SwaggerCreateSharedLink } from './shared-link.swagger';

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

  @Get('shared-links/:token/profile')
  @SwaggerGetEmployeeProfile()
  async consumeProfile(
    @Req() request: Request,
    @Param('token') token: string,
  ): Promise<EmployeeProfileEntity> {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    const link = await this.sharedLinks.findLinkByToken(token);
    this.sharedLinks.assertRecipient(link, viewerEmployeeId);
    return this.assembler.assembleProfileViaSharedLink(link);
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
