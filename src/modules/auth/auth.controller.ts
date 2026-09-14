import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { ThrottleLogin } from '../../common/throttling/throttle.decorators';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUserProvider } from '../contracts/current-user-provider.contract';
import { clearSessionCookie, setSessionCookie } from './auth-cookie';
import { AuthService } from './auth.service';
import { SwaggerLogin, SwaggerLogout, SwaggerSession } from './auth.swagger';
import { LoginDto } from './dto/login.dto';
import { SessionEntity } from './entities/session.entity';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly currentUser: CurrentUserProvider,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @ThrottleLogin()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @SwaggerLogin()
  async login(
    @Body() credentials: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionEntity> {
    try {
      const session = await this.auth.login(credentials);
      setSessionCookie(response, session.token, this.config);
      return await this.buildSession(session.userId);
    } catch (error) {
      clearSessionCookie(response, this.config);
      throw error;
    }
  }

  @Get('session')
  @SwaggerSession()
  async session(@Req() request: Request): Promise<SessionEntity> {
    const { userId } = await Promise.resolve(
      this.currentUser.getCurrentUser(request),
    );
    return await this.buildSession(userId);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @SwaggerLogout()
  logout(@Res({ passthrough: true }) response: Response): void {
    clearSessionCookie(response, this.config);
  }

  private async buildSession(userId: string): Promise<SessionEntity> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, employee: { select: { id: true } } },
    });

    return {
      userId,
      name: user?.name ?? user?.email ?? '',
      employeeId: user?.employee?.id ?? null,
    };
  }
}
