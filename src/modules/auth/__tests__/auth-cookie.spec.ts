import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { MAX_SAFE_JWT_TTL_SECONDS } from '../../../config/env.validation';
import {
  clearSessionCookie,
  SESSION_COOKIE_NAME,
  setSessionCookie,
  toCookieMaxAge,
} from '../auth-cookie';

describe('session cookie', () => {
  const cookie = jest.fn();
  const clearCookie = jest.fn();
  const response = { cookie, clearCookie } as unknown as Response;
  const config = {
    get: jest.fn((key: string) =>
      key === 'NODE_ENV' ? 'production' : undefined,
    ),
    getOrThrow: jest.fn((key: string) =>
      key === 'JWT_TTL_SECONDS' ? 3600 : undefined,
    ),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sets an HttpOnly Secure SameSite cookie with the JWT lifetime', () => {
    setSessionCookie(response, 'signed-token', config);

    expect(cookie).toHaveBeenCalledWith(SESSION_COOKIE_NAME, 'signed-token', {
      httpOnly: true,
      sameSite: 'strict',
      secure: true,
      path: '/',
      maxAge: 3_600_000,
    });
  });

  it('clears the cookie using matching security attributes', () => {
    clearSessionCookie(response, config);

    expect(clearCookie).toHaveBeenCalledWith(SESSION_COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'strict',
      secure: true,
      path: '/',
    });
  });

  it('accepts the largest safely convertible JWT lifetime', () => {
    expect(toCookieMaxAge(MAX_SAFE_JWT_TTL_SECONDS)).toBe(
      MAX_SAFE_JWT_TTL_SECONDS * 1000,
    );
  });

  it.each([0, -1, 1.5, MAX_SAFE_JWT_TTL_SECONDS + 1])(
    'rejects unsafe JWT lifetime %p',
    (seconds) => {
      expect(() => toCookieMaxAge(seconds)).toThrow(RangeError);
    },
  );
});
