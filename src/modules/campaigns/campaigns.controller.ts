import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUserProvider } from '../contracts/current-user-provider.contract';
import { PERMISSION_KEYS } from '../contracts/permission-keys';
import { PermissionChecker } from '../contracts/permission-checker.contract';
import { PrismaService } from '../../prisma/prisma.service';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { SaveCampaignAudienceDto } from './dto/save-campaign-audience.dto';
import { PreviewCampaignAudienceQueryDto } from './dto/preview-campaign-audience-query.dto';
import {
  SwaggerCreateCampaign,
  SwaggerGetCampaign,
  SwaggerListCampaigns,
  SwaggerPreviewCampaignAudience,
  SwaggerResolveCampaignAudience,
  SwaggerSaveCampaignAudience,
  SwaggerUpdateCampaign,
} from './campaigns.swagger';

@ApiTags('campaigns')
@Controller('campaigns')
export class CampaignsController {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly currentUser: CurrentUserProvider,
    private readonly prisma: PrismaService,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  @Post()
  @SwaggerCreateCampaign()
  async create(@Req() request: Request, @Body() dto: CreateCampaignDto) {
    const { userId } = await this.currentUser.getCurrentUser(request);
    await this.assertCanCreate(userId);
    const creatorId = await this.resolveViewerEmployeeId(userId);
    return this.campaigns.createCampaign(creatorId, dto);
  }

  @Get()
  @SwaggerListCampaigns()
  async list(@Req() request: Request) {
    const { userId } = await this.currentUser.getCurrentUser(request);
    const creatorId = await this.resolveViewerEmployeeId(userId);
    return this.campaigns.listForCreator(creatorId);
  }

  @Get(':campaignId')
  @SwaggerGetCampaign()
  async getOne(
    @Req() request: Request,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
  ) {
    const { userId } = await this.currentUser.getCurrentUser(request);
    const creatorId = await this.resolveViewerEmployeeId(userId);
    return this.campaigns.getForCreator(campaignId, creatorId);
  }

  @Patch(':campaignId')
  @SwaggerUpdateCampaign()
  async update(
    @Req() request: Request,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    const { userId } = await this.currentUser.getCurrentUser(request);
    const creatorId = await this.resolveViewerEmployeeId(userId);
    return this.campaigns.updateDraft(campaignId, creatorId, dto);
  }

  @Put(':campaignId/audience')
  @SwaggerSaveCampaignAudience()
  async saveAudience(
    @Req() request: Request,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Body() dto: SaveCampaignAudienceDto,
  ) {
    const { userId } = await this.currentUser.getCurrentUser(request);
    const creatorId = await this.resolveViewerEmployeeId(userId);
    return this.campaigns.saveAudience(campaignId, creatorId, dto);
  }

  @Get(':campaignId/audience/preview')
  @SwaggerPreviewCampaignAudience()
  async previewAudience(
    @Req() request: Request,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Query() query: PreviewCampaignAudienceQueryDto,
  ) {
    const { userId } = await this.currentUser.getCurrentUser(request);
    const creatorId = await this.resolveViewerEmployeeId(userId);
    return this.campaigns.previewAudience(campaignId, creatorId, userId, query);
  }

  @Get(':campaignId/audience/resolve')
  @SwaggerResolveCampaignAudience()
  async resolveAudience(
    @Req() request: Request,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
  ) {
    const { userId } = await this.currentUser.getCurrentUser(request);
    const creatorId = await this.resolveViewerEmployeeId(userId);
    const employeeIds = await this.campaigns.resolveAudienceEmployeeIds(
      campaignId,
      creatorId,
    );
    return { employeeIds };
  }

  /**
   * Widened per spec-10-1 Design Notes: `PermissionChecker.hasPermission`
   * already folds manager/PP default access into `CREATE_FORM_CAMPAIGNS` —
   * this controller never re-derives that widening itself.
   */
  private async assertCanCreate(userId: string): Promise<void> {
    const hasPermission = await this.permissionChecker.hasPermission(
      userId,
      PERMISSION_KEYS.CREATE_FORM_CAMPAIGNS,
    );
    if (!hasPermission) {
      throw new ForbiddenException(
        'Viewer lacks create_form_campaigns permission',
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
