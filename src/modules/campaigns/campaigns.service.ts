import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { FormCampaign, User } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import {
  formatCampaignDueDate,
  normalizeCampaignFields,
  normalizePartialCampaignFields,
} from './campaign-input';
import { CampaignReadEntity } from './entities/campaign.entity';

type CampaignWithCreator = FormCampaign & {
  creator: {
    id: string;
    user: Pick<User, 'name' | 'email'>;
  };
};

@Injectable()
export class CampaignsService {
  constructor(private readonly prisma: PrismaService) {}

  async createCampaign(
    creatorId: string,
    dto: CreateCampaignDto,
  ): Promise<CampaignReadEntity> {
    const normalized = normalizeCampaignFields(dto);
    const campaign = await this.prisma.formCampaign.create({
      data: {
        creatorId,
        title: normalized.title,
        description: normalized.description,
        purpose: normalized.purpose,
        link: normalized.link,
        dueDate: normalized.dueDate,
        status: 'draft',
      },
      include: this.creatorInclude,
    });
    return this.toReadDto(campaign);
  }

  async listForCreator(creatorId: string): Promise<CampaignReadEntity[]> {
    const campaigns = await this.prisma.formCampaign.findMany({
      where: { creatorId },
      include: this.creatorInclude,
      orderBy: { createdAt: 'desc' },
    });
    return campaigns.map((campaign) => this.toReadDto(campaign));
  }

  async getForCreator(
    campaignId: string,
    creatorId: string,
  ): Promise<CampaignReadEntity> {
    const campaign = await this.findOwnedCampaign(campaignId, creatorId);
    return this.toReadDto(campaign);
  }

  async updateDraft(
    campaignId: string,
    creatorId: string,
    dto: UpdateCampaignDto,
  ): Promise<CampaignReadEntity> {
    // findOwnedCampaign first, so a non-owned or non-existent id still 404s
    // before we ever reveal (via a 409) that a matching id exists at all.
    await this.findOwnedCampaign(campaignId, creatorId);

    const normalized = normalizePartialCampaignFields(dto);
    // Conditional, atomic update: the `status: 'draft'` precondition is
    // checked and applied in the same statement, so a concurrent activation
    // between the ownership check above and this write can never let a
    // stale PATCH silently overwrite a no-longer-draft campaign (TOCTOU).
    const result = await this.prisma.formCampaign.updateMany({
      where: { id: campaignId, status: 'draft' },
      data: normalized,
    });
    if (result.count === 0) {
      throw new ConflictException('Only draft campaigns can be edited');
    }

    return this.getForCreator(campaignId, creatorId);
  }

  private readonly creatorInclude = {
    creator: {
      include: {
        user: { select: { name: true, email: true } },
      },
    },
  } as const;

  private async findOwnedCampaign(
    campaignId: string,
    creatorId: string,
  ): Promise<CampaignWithCreator> {
    const campaign = await this.prisma.formCampaign.findFirst({
      where: { id: campaignId, creatorId },
      include: this.creatorInclude,
    });
    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }
    return campaign;
  }

  private toReadDto(campaign: CampaignWithCreator): CampaignReadEntity {
    return {
      id: campaign.id,
      title: campaign.title,
      description: campaign.description,
      purpose: campaign.purpose,
      link: campaign.link,
      dueDate: formatCampaignDueDate(campaign.dueDate),
      status: campaign.status,
      creator: {
        id: campaign.creator.id,
        displayName: this.displayName(campaign.creator.user),
      },
      createdAt: campaign.createdAt.toISOString(),
      updatedAt: campaign.updatedAt.toISOString(),
    };
  }

  private displayName(user: Pick<User, 'name' | 'email'>): string {
    const name = user.name?.trim();
    if (name) {
      return name;
    }
    if (user.email) {
      return user.email;
    }
    return 'Unknown';
  }
}
