import { applyDecorators, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  LOGIN_THROTTLE_LIMIT,
  LOGIN_THROTTLE_TTL_MS,
  SHARED_LINK_THROTTLE_LIMIT,
  SHARED_LINK_THROTTLE_TTL_MS,
} from './throttle-limits';

export const ThrottleLogin = () =>
  applyDecorators(
    UseGuards(ThrottlerGuard),
    Throttle({
      default: { limit: LOGIN_THROTTLE_LIMIT, ttl: LOGIN_THROTTLE_TTL_MS },
    }),
  );

export const ThrottleSharedLinkConsumption = () =>
  applyDecorators(
    UseGuards(ThrottlerGuard),
    Throttle({
      default: {
        limit: SHARED_LINK_THROTTLE_LIMIT,
        ttl: SHARED_LINK_THROTTLE_TTL_MS,
      },
    }),
  );
