import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUserProvider } from '../contracts/current-user-provider.contract';
import { PrismaService } from '../../prisma/prisma.service';
import { EmployeeProfileEntity } from './entities/employee-profile.entity';
import { ProfileAssemblerService } from './profile-assembler.service';
import { SwaggerGetEmployeeProfile } from './profile.swagger';

/**
 * Story 1.6 — assembled employee profile read. C1 resolves section grants
 * once per request; ungranted sections are absent from the response (AD-5).
 * Full-access (C13) is not wired in C1 yet — holders get Colleague-equivalent
 * assembly until a later story implements that grant path.
 */
@ApiTags('employees')
@Controller('employees')
export class ProfileController {
  constructor(
    private readonly assembler: ProfileAssemblerService,
    private readonly currentUser: CurrentUserProvider,
    private readonly prisma: PrismaService,
  ) {}

  @Get(':employeeId/profile')
  @SwaggerGetEmployeeProfile()
  async getProfile(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ): Promise<EmployeeProfileEntity> {
    const { userId } = await Promise.resolve(
      this.currentUser.getCurrentUser(request),
    );
    const viewerEmployeeId = await this.resolveEmployeeId(userId);
    if (!viewerEmployeeId) {
      throw new ForbiddenException('Authenticated user has no employee record');
    }

    return this.assembler.assembleProfile(viewerEmployeeId, employeeId);
  }

  private async resolveEmployeeId(userId: string): Promise<string | null> {
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
      select: { id: true },
    });
    return employee?.id ?? null;
  }
}
