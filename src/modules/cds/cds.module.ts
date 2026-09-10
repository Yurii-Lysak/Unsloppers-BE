import { Module } from '@nestjs/common';
import { CdsAssessmentsController } from './cds-assessments.controller';
import { CdsSectionProvider } from './cds-section.provider';
import { CdsService } from './cds.service';
import { IdpDashboardSummaryProvider } from './idp-dashboard-summary.provider';
import { IdpRecordsController } from './idp-records.controller';
import { LastAssessmentDateFieldProvider } from './last-assessment-date-field.provider';
import { OpenIdpFieldProvider } from './open-idp-field.provider';

@Module({
  controllers: [CdsAssessmentsController, IdpRecordsController],
  providers: [
    CdsService,
    CdsSectionProvider,
    IdpDashboardSummaryProvider,
    LastAssessmentDateFieldProvider,
    OpenIdpFieldProvider,
  ],
  exports: [CdsService],
})
export class CdsModule {}
