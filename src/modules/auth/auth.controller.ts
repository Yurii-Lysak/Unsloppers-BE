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
  ) {}

  @Public()
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
      return { userId: session.userId };
    } catch (error) {
      clearSessionCookie(response, this.config);
      throw error;
    }
  }

  @Get('session')
  @SwaggerSession()
  async session(@Req() request: Request): Promise<SessionEntity> {
    return await this.currentUser.getCurrentUser(request);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @SwaggerLogout()
  logout(@Res({ passthrough: true }) response: Response): void {
    clearSessionCookie(response, this.config);
  }
}
