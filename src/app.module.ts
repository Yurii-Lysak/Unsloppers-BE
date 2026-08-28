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
    // Registered here (not just imported ad hoc by prisma/seed.ts) so
    // `NestFactory.createApplicationContext(AppModule)` resolves
    // `TimetrackerService` via normal DI (Story 1.16 Design Notes) — the
    // module itself has no controller and nothing in the running app calls
    // it at request time (spec "Never").
    TimetrackerModule,
    HealthModule,
    UsersModule,
  ],
})
export class AppModule {}
