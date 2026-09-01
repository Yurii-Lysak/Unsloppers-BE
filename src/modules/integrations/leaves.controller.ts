import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUserProvider } from '../contracts/current-user-provider.contract';
import { SectionAccessGate } from '../contracts/section-access-gate.contract';
import { PrismaService } from '../../prisma/prisma.service';
import { LeavesSectionEntity } from './entities/leaves-section.entity';
import { LeavesSectionProvider } from './leaves-section.provider';
import { SwaggerGetEmployeeLeaves } from './leaves.swagger';

@ApiTags('employees')
@Controller('employees')
export class LeavesController {
  constructor(
    private readonly leavesSection: LeavesSectionProvider,
    private readonly currentUser: CurrentUserProvider,
    private readonly prisma: PrismaService,
    private readonly sectionGate: SectionAccessGate,
  ) {}

  @Get(':employeeId/leaves')
  @SwaggerGetEmployeeLeaves()
  async getLeaves(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ): Promise<LeavesSectionEntity> {
    const { userId } = await Promise.resolve(
      this.currentUser.getCurrentUser(request),
    );
    const viewerEmployeeId = await this.resolveEmployeeId(userId);
    if (!viewerEmployeeId) {
      throw new ForbiddenException('Authenticated user has no employee record');
    }

    const subjectExists = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true },
    });
    if (!subjectExists) {
      throw new NotFoundException(`Employee ${employeeId} not found`);
    }

    const audience = await this.sectionGate.requireSection(
      viewerEmployeeId,
      employeeId,
      'S10',
    );

    try {
      return await this.leavesSection.getSection(
        viewerEmployeeId,
        employeeId,
        audience,
      );
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      return {
        availability: 'unavailable',
        leaves: [],
        manageLeaveUrl: null,
      };
    }
  }

  private async resolveEmployeeId(userId: string): Promise<string | null> {
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
      select: { id: true },
    });
    return employee?.id ?? null;
  }
}
