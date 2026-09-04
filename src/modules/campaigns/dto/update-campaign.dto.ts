import { PartialType } from '@nestjs/swagger';
import { CreateCampaignDto } from './create-campaign.dto';

/**
 * Design Notes (spec-10-1) — PATCH accepts any subset of the five editable
 * fields, not all five on every call.
 */
export class UpdateCampaignDto extends PartialType(CreateCampaignDto) {}
