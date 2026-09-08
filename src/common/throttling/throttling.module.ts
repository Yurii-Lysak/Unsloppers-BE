import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { LOGIN_THROTTLE_LIMIT, LOGIN_THROTTLE_TTL_MS } from './throttle-limits';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: config.get<number>(
              'THROTTLE_LOGIN_TTL_MS',
              LOGIN_THROTTLE_TTL_MS,
            ),
            limit: config.get<number>(
              'THROTTLE_LOGIN_LIMIT',
              LOGIN_THROTTLE_LIMIT,
            ),
          },
        ],
      }),
    }),
  ],
  exports: [ThrottlerModule],
})
export class ThrottlingModule {}
