import { ConfigService } from '@nestjs/config';
import { CookieOptions, Response } from 'express';
import { MAX_SAFE_JWT_TTL_SECONDS } from '../../config/env.validation';
import { SESSION_COOKIE_NAME } from '../contracts/session-auth.constants';

export { SESSION_COOKIE_NAME };

export const toCookieMaxAge = (seconds: number): number => {
  if (
    !Number.isSafeInteger(seconds) ||
    seconds <= 0 ||
    seconds > MAX_SAFE_JWT_TTL_SECONDS
  ) {
    throw new RangeError('JWT_TTL_SECONDS cannot be represented safely');
  }
  const milliseconds = seconds * 1000;
  if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0) {
    throw new RangeError('JWT_TTL_SECONDS cannot be represented safely');
  }
  return milliseconds;
};

const baseCookieOptions = (config: ConfigService): CookieOptions => {
  const isProduction = config.get<string>('NODE_ENV') === 'production';
  return {
    httpOnly: true,
    // FE and BE are deployed on different sites (Vercel/Render), so the
    // cookie must be SameSite=None to be sent on cross-site requests at
    // all; locally FE/BE share the localhost site, so Strict is safe there.
    sameSite: isProduction ? 'none' : 'strict',
    // SameSite=None requires Secure — already true in production (HTTPS).
    secure: isProduction,
    path: '/',
  };
};

export const setSessionCookie = (
  response: Response,
  token: string,
  config: ConfigService,
): void => {
  response.cookie(SESSION_COOKIE_NAME, token, {
    ...baseCookieOptions(config),
    maxAge: toCookieMaxAge(config.getOrThrow<number>('JWT_TTL_SECONDS')),
  });
};

export const clearSessionCookie = (
  response: Response,
  config: ConfigService,
): void => {
  response.clearCookie(SESSION_COOKIE_NAME, baseCookieOptions(config));
};
