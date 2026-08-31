import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { envValidationSchema } from '../config/env.validation';

describe('AppModule startup configuration', () => {
  it('starts normally without BOOTCAMP_INITIAL_PASSWORD', async () => {
    const validation = envValidationSchema.validate({
      NODE_ENV: 'test',
      CORS_ORIGIN: 'http://localhost:4200',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/app',
      JWT_SECRET: 'test-only-jwt-secret-at-least-32-characters',
      JWT_TTL_SECONDS: 3600,
    });
    expect(validation.error).toBeUndefined();
    const validatedConfig = validation.value as unknown as Record<
      string,
      string | number
    >;
    expect(validatedConfig).not.toHaveProperty('BOOTCAMP_INITIAL_PASSWORD');

    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue(new ConfigService(validatedConfig))
      .compile();
    const app = module.createNestApplication();

    await expect(app.init()).resolves.toBeDefined();
    await app.close();
  });
});
