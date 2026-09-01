import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ClockModule } from './clock/clock.module';
import { envValidationSchema } from './config/env.validation';
import { HealthModule } from './modules/health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './modules/users/users.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { AccessModule } from './modules/access/access.module';
import { RegistryModule } from './modules/registry/registry.module';
import { TimetrackerModule } from './modules/timetracker/timetracker.module';
import { AuthModule } from './modules/auth/auth.module';
import { DirectoryModule } from './modules/directory/directory.module';
import { TimelineModule } from './modules/timeline/timeline.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { ManagementNotesModule } from './modules/management-notes/management-notes.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    ScheduleModule.forRoot(),
    ClockModule,
    ContractsModule,
    TimelineModule,
    PrismaModule,
    AccessModule,
    AuthModule,
    DirectoryModule,
    RegistryModule,
    // Registered for Epic 13 TimeTracker sync — not used by the bundled bootcamp
    // seed manifest (Story 1.16, Aug 2026 pivot). No controller; nothing calls
    // it at request time today.
    TimetrackerModule,
    IntegrationsModule,
    ManagementNotesModule,
    HealthModule,
    UsersModule,
  ],
})
export class AppModule {}
