import { Module } from '@nestjs/common';
import { FeedbacksController } from './feedbacks.controller';
import { FeedbacksSectionProvider } from './feedbacks-section.provider';
import { FeedbacksService } from './feedbacks.service';

@Module({
  controllers: [FeedbacksController],
  providers: [FeedbacksService, FeedbacksSectionProvider],
  exports: [FeedbacksService],
})
export class FeedbacksModule {}
