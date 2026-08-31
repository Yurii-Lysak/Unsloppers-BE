import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { NextFunction, Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { clearSessionCookie, SESSION_COOKIE_NAME } from './auth-cookie';
import type { JwtPayload } from './auth.types';

@Injectable()
export class SwaggerAuthMiddleware {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async use(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    const cookies = request.cookies as Record<string, unknown> | undefined;
    const token = cookies?.[SESSION_COOKIE_NAME];

    try {
      if (typeof token !== 'string') {
        throw new Error('Missing session');
      }
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true },
      });
      if (!user) {
        throw new Error('Session user no longer exists');
      }
      next();
    } catch {
      clearSessionCookie(response, this.config);
      response.status(401).json({
        message: 'Unauthorized',
        statusCode: 401,
      });
    }
  }
}
