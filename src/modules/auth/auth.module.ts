import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { CurrentUserProvider } from '../contracts/current-user-provider.contract';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthenticatedCurrentUserProvider } from './authenticated-current-user.provider';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';
import { PasswordService } from './password.service';
import { SwaggerAuthMiddleware } from './swagger-auth.middleware';

@Global()
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.getOrThrow<number>('JWT_TTL_SECONDS'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    JwtStrategy,
    SwaggerAuthMiddleware,
    {
      provide: CurrentUserProvider,
      useClass: AuthenticatedCurrentUserProvider,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
  exports: [CurrentUserProvider, SwaggerAuthMiddleware],
})
export class AuthModule {}
