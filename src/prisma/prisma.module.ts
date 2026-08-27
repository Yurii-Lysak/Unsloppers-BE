import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service';
import { TimelineEventWriter } from '../modules/contracts/timeline-event-writer.contract';
import { createTemporalHistoryExtension } from './extensions/temporal-history.extension';

/**
 * `@Global()` so every feature module can inject `PrismaService` without
 * importing this module explicitly (existing convention).
 *
 * Story 1.20: the value resolved for the `PrismaService` token is the
 * temporal-history-extended client (`raw.$extends(...)`), never the raw
 * `PrismaClient` subclass — so `.gradeHistory.create()` (and the other 3
 * history models) is unreachable anywhere in the app without going through
 * the extension. `raw` is built with a plain `new PrismaService(...)` inside
 * this factory rather than as its own DI provider/token, specifically so it
 * is never independently resolvable/injectable — there is exactly one
 * `PrismaService`-token provider in the whole DI graph, and it is the
 * guarded one.
 *
 * Prisma 7's `$extends()` is not documented to preserve arbitrary instance
 * methods added by subclassing `PrismaClient` (unverified — see the story's
 * Design Notes) — `onModuleInit` / `onModuleDestroy` are therefore
 * re-attached explicitly onto the extended object so Nest's lifecycle hooks
 * keep firing on the exact instance every module injects, regardless of
 * whether `$extends()` would have preserved them on its own.
 */
@Global()
@Module({
  providers: [
    {
      provide: PrismaService,
      useFactory: (
        config: ConfigService,
        timelineEventWriter: TimelineEventWriter,
      ) => {
        const raw = new PrismaService(config);
        const extended = raw.$extends(
          createTemporalHistoryExtension(timelineEventWriter, raw),
        );

        (extended as unknown as PrismaService).onModuleInit =
          raw.onModuleInit.bind(raw);
        (extended as unknown as PrismaService).onModuleDestroy =
          raw.onModuleDestroy.bind(raw);

        return extended;
      },
      inject: [ConfigService, TimelineEventWriter],
    },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
