import { applyDecorators } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SESSION_COOKIE_NAME } from './auth-cookie';
import { SessionEntity } from './entities/session.entity';

export const SwaggerLogin = () =>
  applyDecorators(
    ApiOkResponse({ type: SessionEntity }),
    ApiUnauthorizedResponse({ description: 'Invalid email or password' }),
  );

export const SwaggerSession = () =>
  applyDecorators(
    ApiCookieAuth(SESSION_COOKIE_NAME),
    ApiOkResponse({ type: SessionEntity }),
    ApiUnauthorizedResponse({ description: 'Authentication required' }),
  );

export const SwaggerLogout = () =>
  applyDecorators(
    ApiCookieAuth(SESSION_COOKIE_NAME),
    ApiNoContentResponse(),
    ApiUnauthorizedResponse({ description: 'Authentication required' }),
  );
