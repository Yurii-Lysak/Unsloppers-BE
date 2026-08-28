import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envValidationSchema } from './config/env.validation';
import { HealthModule } from './modules/health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './modules/users/users.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { RegistryModule } from './modules/registry/registry.module';
import { TimetrackerModule } from './modules/timetracker/timetracker.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    PrismaModule,
    ContractsModule,
    RegistryModule,
    // Registered for Epic 13 TimeTracker sync — not used by the bundled bootcamp
    // seed manifest (Story 1.16, Aug 2026 pivot). No controller; nothing calls
    // it at request time today.
    TimetrackerModule,
    HealthModule,
    UsersModule,
  ],
})
export class AppModule {}
