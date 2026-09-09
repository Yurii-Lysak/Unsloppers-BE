import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUserProvider } from '../contracts/current-user-provider.contract';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardsService } from './dashboards.service';
import { GetDashboardSummaryQueryDto } from './dto/get-dashboard-summary-query.dto';
import {
  SwaggerGetDashboardConfig,
  SwaggerGetDashboardSummary,
} from './dashboards.swagger';

@ApiTags('dashboards')
@Controller('dashboards')
export class DashboardsController {
  constructor(
    private readonly dashboards: DashboardsService,
    private readonly currentUser: CurrentUserProvider,
    private readonly prisma: PrismaService,
  ) {}

  @Get('config')
  @SwaggerGetDashboardConfig()
  async getConfig(@Req() request: Request) {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    return this.dashboards.getConfig(viewerEmployeeId);
  }

  @Get('summary')
  @SwaggerGetDashboardSummary()
  async getSummary(
    @Req() request: Request,
    @Query() query: GetDashboardSummaryQueryDto,
  ) {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    return this.dashboards.getSummary(viewerEmployeeId, query);
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
