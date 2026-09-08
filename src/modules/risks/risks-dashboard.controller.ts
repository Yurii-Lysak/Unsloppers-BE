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
import { ListRiskDashboardQueryDto } from './dto/list-risk-dashboard-query.dto';
import { RisksDashboardService } from './risks-dashboard.service';
import {
  SwaggerRiskDashboard,
  SwaggerRiskDashboardAccess,
} from './risks-dashboard.swagger';

@ApiTags('risks')
@Controller('risks/dashboard')
export class RisksDashboardController {
  constructor(
    private readonly dashboard: RisksDashboardService,
    private readonly currentUser: CurrentUserProvider,
    private readonly prisma: PrismaService,
  ) {}

  @Get('access')
  @SwaggerRiskDashboardAccess()
  async getAccess(@Req() request: Request) {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    return this.dashboard.getAccess(viewerEmployeeId);
  }

  @Get()
  @SwaggerRiskDashboard()
  async getDashboard(
    @Req() request: Request,
    @Query() query: ListRiskDashboardQueryDto,
  ) {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    const access = await this.dashboard.getAccess(viewerEmployeeId);
    if (!access.canAccess) {
      throw new ForbiddenException('Risk dashboard is not accessible');
    }
    return this.dashboard.getDashboard(viewerEmployeeId, query);
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
