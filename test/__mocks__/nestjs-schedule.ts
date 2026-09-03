import { DynamicModule, Module } from '@nestjs/common';
import 'reflect-metadata';

const SCHEDULE_CRON_OPTIONS = 'SCHEDULE_CRON_OPTIONS';

@Module({})
export class ScheduleModule {
  static forRoot(): DynamicModule {
    return {
      module: ScheduleModule,
      providers: [SchedulerRegistry],
      exports: [SchedulerRegistry],
    };
  }
}

export class SchedulerRegistry {
  private readonly cronJobs = new Map<
    string,
    { cronTime: { source: string } }
  >();

  addCronJob(name: string, job: { cronTime: { source: string } }): void {
    this.cronJobs.set(name, job);
  }

  getCronJobs(): Map<string, { cronTime: { source: string } }> {
    return this.cronJobs;
  }

  deleteCronJob(name: string): void {
    this.cronJobs.delete(name);
  }
}

export function Cron(cronTime: string | Date): MethodDecorator {
  return (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    Reflect.defineMetadata(
      SCHEDULE_CRON_OPTIONS,
      { cronTime },
      descriptor.value as object,
    );
    return descriptor;
  };
}
