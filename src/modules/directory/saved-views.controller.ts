import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUserProvider } from '../contracts/current-user-provider.contract';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSavedViewDto } from './dto/create-saved-view.dto';
import { ShareSavedViewDto } from './dto/share-saved-view.dto';
import { UpdateSavedViewDto } from './dto/update-saved-view.dto';
import { SavedViewEntity } from './entities/saved-view.entity';
import { SavedViewsService } from './saved-views.service';
import {
  SwaggerCreateSavedView,
  SwaggerDeleteSavedView,
  SwaggerListSavedViews,
  SwaggerShareSavedView,
  SwaggerUpdateSavedView,
} from './saved-views.swagger';

@ApiTags('saved-views')
@Controller('saved-views')
export class SavedViewsController {
  constructor(
    private readonly savedViews: SavedViewsService,
    private readonly currentUser: CurrentUserProvider,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @SwaggerListSavedViews()
  async list(@Req() request: Request): Promise<SavedViewEntity[]> {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    return this.savedViews.listForViewer(viewerEmployeeId);
  }

  @Post()
  @SwaggerCreateSavedView()
  async create(
    @Req() request: Request,
    @Body() dto: CreateSavedViewDto,
  ): Promise<SavedViewEntity> {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    return this.savedViews.create(viewerEmployeeId, dto);
  }

  @Patch(':viewId')
  @SwaggerUpdateSavedView()
  async update(
    @Req() request: Request,
    @Param('viewId', ParseUUIDPipe) viewId: string,
    @Body() dto: UpdateSavedViewDto,
  ): Promise<SavedViewEntity> {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    return this.savedViews.update(viewerEmployeeId, viewId, dto);
  }

  @Delete(':viewId')
  @SwaggerDeleteSavedView()
  async remove(
    @Req() request: Request,
    @Param('viewId', ParseUUIDPipe) viewId: string,
  ): Promise<{ deleted: true }> {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    await this.savedViews.remove(viewerEmployeeId, viewId);
    return { deleted: true };
  }

  @Put(':viewId/shares')
  @SwaggerShareSavedView()
  async replaceShares(
    @Req() request: Request,
    @Param('viewId', ParseUUIDPipe) viewId: string,
    @Body() dto: ShareSavedViewDto,
  ): Promise<SavedViewEntity> {
    const viewerEmployeeId = await this.resolveViewerEmployeeId(request);
    return this.savedViews.replaceShares(viewerEmployeeId, viewId, dto);
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
