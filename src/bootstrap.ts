import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { SESSION_COOKIE_NAME } from './modules/auth/auth-cookie';
import { SwaggerAuthMiddleware } from './modules/auth/swagger-auth.middleware';

export const configureApp = (app: INestApplication): OpenAPIObject => {
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  app.use(cookieParser());
  app.enableCors({
    origin: config.getOrThrow<string>('CORS_ORIGIN'),
    credentials: true,
  });
  app.enableShutdownHooks();

  const swaggerAuth = app.get(SwaggerAuthMiddleware);
  app.use('/api/docs', swaggerAuth.use.bind(swaggerAuth));
  app.use('/api/docs-json', swaggerAuth.use.bind(swaggerAuth));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('API')
    .setDescription('Backend API documentation')
    .setVersion('1.0')
    .addCookieAuth(SESSION_COOKIE_NAME, { type: 'apiKey' }, SESSION_COOKIE_NAME)
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  return document;
};
