import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUserProvider } from '../contracts/current-user-provider.contract';
import { PERMISSION_KEYS } from '../contracts/permission-keys';
import { PermissionChecker } from '../contracts/permission-checker.contract';
import { SectionAccessGate } from '../contracts/section-access-gate.contract';
import { PrismaService } from '../../prisma/prisma.service';
import { PatchOpenToMentoringDto } from './dto/patch-open-to-mentoring.dto';
import { MentorshipService } from './mentorship.service';
import { RejectMentorshipStatusWriteInterceptor } from './reject-mentorship-status-write.interceptor';
import {
  SwaggerListWillingMentors,
  SwaggerPatchOpenToMentoring,
} from './mentorship.swagger';

@ApiTags('mentorship')
@Controller('employees/:employeeId/mentorship')
export class EmployeeMentorshipController {
  constructor(
    private readonly mentorship: MentorshipService,
    private readonly currentUser: CurrentUserProvider,
    private readonly prisma: PrismaService,
    private readonly sectionGate: SectionAccessGate,
  ) {}

  @Patch('open-to-mentoring')
  @UseInterceptors(RejectMentorshipStatusWriteInterceptor)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  @SwaggerPatchOpenToMentoring()
  async patchOpenToMentoring(
    @Req() request: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: PatchOpenToMentoringDto,
  ) {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    await this.assertSubjectEmployeeExists(employeeId);

    if (viewerEmployeeId !== employeeId) {
      throw new ForbiddenException(
        'Only the profile owner may update open-to-mentoring',
      );
    }

    await this.sectionGate.requireSection(
      viewerEmployeeId,
      employeeId,
      'S13',
      'RW',
    );

    return this.mentorship.updateOpenToMentoring(
      employeeId,
      dto.openToMentoring,
    );
  }

  private async assertSubjectEmployeeExists(employeeId: string): Promise<void> {
    const subject = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true },
    });
    if (!subject) {
      throw new NotFoundException(`Employee ${employeeId} not found`);
    }
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

@ApiTags('mentorship')
@Controller('mentorship')
export class MentorshipPoolController {
  constructor(
    private readonly mentorship: MentorshipService,
    private readonly currentUser: CurrentUserProvider,
    private readonly prisma: PrismaService,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  @Get('willing-mentors')
  @SwaggerListWillingMentors()
  async listWillingMentors(@Req() request: Request) {
    const { userId } = await this.currentUser.getCurrentUser(request);
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!employee) {
      throw new ForbiddenException('Authenticated user has no employee record');
    }

    const allowed = await this.permissionChecker.hasPermission(
      userId,
      PERMISSION_KEYS.ASSIGN_END_MENTORSHIPS,
    );
    if (!allowed) {
      throw new ForbiddenException(
        'Viewer lacks assign and end mentorships permission',
      );
    }

    const mentors = await this.mentorship.listWillingMentors();
    return { mentors };
  }
}
